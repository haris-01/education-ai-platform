import type { Chunk } from '../types/chunk'
import type { Embedder } from '../types/embedder'
import type {
  EmbeddingChunk,
  EmbeddingDocument,
} from '../types/embedding-document'

const EXTRACTOR_VERSION = '0.1.0'

export interface BuildEmbeddingDocumentInput {
  resourceId: string

  title: string

  chunks: Chunk[]

  embedder: Embedder

  // Chunk id to the content hash already stored for it, as reported by a
  // vector store. Any chunk whose hash still matches is left out of the
  // result entirely — the row holding it is already correct, so there is
  // nothing to embed and nothing to write. Optional: a first run has
  // nothing stored.
  storedHashes?: Map<string, string>
}

// Turns chunks into Phase 5's output: the chunks that needed embedding,
// each carrying its vector, plus a record of what produced them.
//
// The result holds what changed, not everything that was passed in.
// Embedding is the only step in this pipeline that costs money and the
// only one that can be rate-limited, so it is the one worth making
// incremental — and re-reading a stored vector purely to write it back
// unchanged would trade an API call for a column scan of 768 floats,
// which is not a trade worth making.
export async function buildEmbeddingDocument(
  input: BuildEmbeddingDocumentInput
): Promise<EmbeddingDocument> {
  const { resourceId, title, chunks, embedder, storedHashes } = input

  const stale = chunks.filter((chunk) => !isUnchanged(chunk, storedHashes))
  const vectors = await embedder.embed(
    stale.map((chunk) => chunk.content),
    'document'
  )

  return {
    metadata: {
      resourceId,
      title,
      embeddingModel: embedder.model,
      dimensions: embedder.dimensions,
      chunkCount: chunks.length,
      skippedCount: chunks.length - stale.length,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    chunks: stale.map((chunk, index): EmbeddingChunk => {
      const embedding = vectors[index]

      if (embedding?.length !== embedder.dimensions) {
        throw new Error(
          `Chunk ${chunk.id} got ${embedding?.length ?? 0} dimensions, expected ${embedder.dimensions}`
        )
      }

      return { ...chunk, embedding, embeddingModel: embedder.model }
    }),
  }
}

function isUnchanged(
  chunk: Chunk,
  storedHashes: Map<string, string> | undefined
): boolean {
  return storedHashes?.get(chunk.id) === chunk.contentHash
}
