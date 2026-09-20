import type {
  SearchFilter,
  SearchHit,
  VectorStore,
} from '../types/vector-store'

// Reciprocal rank fusion's smoothing constant. 60 is the value from the
// original paper and the one every implementation uses; it matters less
// than it looks, because it only controls how sharply the top of each
// list outweighs its tail.
const RRF_K = 60

// How deep each ranker looks before fusing. Deeper than the requested
// limit on purpose: a result ranked 8th by vectors and 9th by text is
// exactly the kind of agreement fusion exists to surface, and it is
// invisible if both lists stop at 5.
const CANDIDATE_DEPTH = 40

export interface SearchHybridInput {
  store: VectorStore

  // The same question, in both forms the two rankers need.
  queryVector: number[]

  queryText: string

  filter?: SearchFilter

  limit?: number
}

// Runs both searches and fuses their rankings.
//
// Fusion is on rank, not on score, and that is the whole design. Cosine
// distance and `ts_rank` are different quantities on unrelated scales:
// one is a distance where smaller is better, the other a relevance score
// where larger is better, and `ts_rank` has no fixed upper bound at all.
// Any attempt to normalise them into a shared scale is a guess about
// distributions that changes with the corpus. Their orderings, on the
// other hand, are directly comparable — which is what reciprocal rank
// fusion uses, and why it needs no tuning per corpus.
export async function searchHybrid(
  input: SearchHybridInput
): Promise<SearchHit[]> {
  const { store, queryVector, queryText, filter } = input
  const limit = input.limit ?? 10

  const [semantic, lexical] = await Promise.all([
    store.searchSimilar(queryVector, filter, CANDIDATE_DEPTH),
    store.searchLexical(queryText, filter, CANDIDATE_DEPTH),
  ])

  const scores = new Map<string, number>()
  const hits = new Map<string, SearchHit>()

  ;[semantic, lexical].forEach((ranking) => {
    ranking.forEach((hit, index) => {
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (RRF_K + index + 1))
      // Keep the richer record: the semantic hit carries a distance, the
      // lexical one a score, and a chunk found by both should report
      // both rather than whichever arrived last.
      hits.set(hit.id, { ...hits.get(hit.id), ...hit })
    })
  })

  return [...scores.entries()]
    .map(([id, fusedScore]) => ({ ...(hits.get(id) as SearchHit), fusedScore }))
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, limit)
}
