import type { Chunk } from './chunk'

// A chunk that has been through an embedder.
export interface EmbeddingChunk extends Chunk {
  embedding: number[]

  // Which embedder produced this vector. On the chunk rather than only
  // on the document because a vector without its model is not
  // interpretable — vectors from different models are not comparable,
  // and once a chunk is a row in a shared table it has left its document
  // behind.
  embeddingModel: string
}

export interface EmbeddingDocumentMetadata {
  resourceId: string

  title: string

  // Which embedder produced every vector in this document. Vectors from
  // different models are not comparable, so this travels with them
  // rather than being assumed from config at query time.
  embeddingModel: string

  dimensions: number

  // Every chunk that went in, including any skipped as unchanged.
  chunkCount: number

  // How many were already stored with a matching content hash, and so
  // were neither embedded nor returned. Reported rather than inferred so
  // a caller can log what a run actually cost.
  skippedCount: number

  extractedAt: Date

  extractorVersion: string
}

// Phase 5's output contract: the chunks of one source document, each
// carrying its vector, its metadata and the text it was built from.
export interface EmbeddingDocument {
  metadata: EmbeddingDocumentMetadata

  chunks: EmbeddingChunk[]
}
