// Whether text is being embedded to be stored and searched over, or to
// search with. Embedding models trained for retrieval place the two in
// deliberately different regions of the space — a question and the query
// that should find it are not the same sentence, and asking the model to
// treat them identically measurably costs recall. Phase 6 depends on
// this distinction, so it is in the contract rather than a call option.
export type EmbedTaskType = 'document' | 'query'

// The one thing every embedding provider has to do. Kept this small on
// purpose: swapping Gemini for Cohere, or for a local model, should be
// one new file and no change anywhere else.
export interface Embedder {
  // Provider-qualified, e.g. "gemini-embedding-001". Recorded on every
  // document so a stored vector can always name what produced it.
  readonly model: string

  // Fixed per embedder. The vector column's width is part of the
  // database schema, so changing this is a migration, not a config edit.
  readonly dimensions: number

  // Order-preserving: result[i] is the vector for texts[i].
  embed(texts: string[], taskType: EmbedTaskType): Promise<number[][]>
}
