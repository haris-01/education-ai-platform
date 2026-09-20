import { createHash } from 'node:crypto'

import type { ChunkType } from '../types/chunk'

// Deterministic, readable, and stable across runs: the same question in
// the same paper always produces the same id, so re-running the pipeline
// updates that row rather than inserting a second copy of it.
export function createChunkId(
  sourceDocumentId: string,
  chunkType: ChunkType,
  key: string
): string {
  return `${sourceDocumentId}:${chunkType}:${key}`
}

// Identifies the embedded text, not the chunk. Two runs that produce
// byte-identical content can reuse the stored vector; anything else has
// to be re-embedded. This is the only guard against paying an embedding
// provider twice for the same sentence.
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
