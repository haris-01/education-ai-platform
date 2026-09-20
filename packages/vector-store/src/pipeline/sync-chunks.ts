import type { Chunk, Embedder } from '@education-ai/embeddings'
import { buildEmbeddingDocument } from '@education-ai/embeddings'

import type { VectorStore } from '../types/vector-store'

export interface SyncChunksInput {
  resourceId: string

  title: string

  // Every chunk the pipeline currently produces for these source
  // documents. Partial lists are not supported on purpose: this function
  // makes the store match what it is given, so a partial list would
  // delete the rest.
  chunks: Chunk[]

  embedder: Embedder

  store: VectorStore
}

export interface SyncReport {
  total: number

  // Chunks whose text was new or changed, so had to be embedded.
  embedded: number

  // Chunks already stored with identical text, whose metadata was
  // updated in place without re-embedding.
  refreshed: number

  // Rows removed because the pipeline no longer produces them.
  removed: number

  embeddingModel: string
}

// Makes the store match the chunks it is given, for the source documents
// those chunks belong to.
//
// This exists as one function because doing it correctly is four steps
// that must all happen, and any caller assembling them by hand will
// eventually leave one out:
//
//  1. ask what is already stored and unchanged,
//  2. embed only what is new or altered,
//  3. update metadata on everything else without re-embedding it,
//  4. delete rows the pipeline no longer produces.
//
// Step 3 exists because `contentHash` covers the embedded text alone, so
// a metadata-only change is invisible to step 1. Step 4 exists because
// without it the store only ever grows. Both were real bugs before they
// were steps: a stale exemplar flag, and a withdrawn question that
// stayed retrievable after the parser learned to recognise it.
//
// Running this twice with the same input is a no-op the second time.
export async function syncChunks(input: SyncChunksInput): Promise<SyncReport> {
  const { resourceId, title, chunks, embedder, store } = input

  const sourceDocumentIds = [
    ...new Set(chunks.map((chunk) => chunk.sourceDocumentId)),
  ]

  const storedHashes = await store.getStoredHashes(sourceDocumentIds)

  const document = await buildEmbeddingDocument({
    resourceId,
    title,
    chunks,
    embedder,
    storedHashes,
  })

  await store.upsertChunks(document.chunks)

  const embeddedIds = new Set(document.chunks.map((chunk) => chunk.id))
  const unchanged = chunks.filter((chunk) => !embeddedIds.has(chunk.id))
  const refreshed = await store.refreshMetadata(unchanged)

  const removed = await store.deleteMissing(
    sourceDocumentIds,
    chunks.map((chunk) => chunk.id)
  )

  return {
    total: chunks.length,
    embedded: document.chunks.length,
    refreshed,
    removed,
    embeddingModel: embedder.model,
  }
}
