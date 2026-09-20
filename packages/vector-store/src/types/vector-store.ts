import type { DifficultyBand } from '@education-ai/difficulty-estimation'
import type {
  Chunk,
  ChunkMetadata,
  ChunkPayload,
  ChunkType,
  EmbeddingChunk,
  SyllabusTier,
} from '@education-ai/embeddings'

// What a retrieval query may narrow by before ranking. Every field is
// optional and they combine with AND — an empty filter searches
// everything, which is the sensible default for a first query.
export interface SearchFilter {
  chunkTypes?: ChunkType[]

  syllabusCode?: string

  paperCodes?: string[]

  topicNumbers?: number[]

  subTopicNumber?: string

  tier?: SyllabusTier

  // Matches a chunk that tests any of these objectives.
  assessmentObjectives?: string[]

  difficulties?: DifficultyBand[]

  minMarks?: number

  hasDiagram?: boolean

  // Restrict to chunks fit to be imitated. Retrieval that feeds a
  // generator sets this; retrieval that feeds a reader does not.
  exemplarsOnly?: boolean

  // Excludes chunks from these source documents. Phase 7 needs it to
  // generate a paper without retrieving the paper it is imitating.
  excludeSourceDocumentIds?: string[]
}

export interface SearchHit {
  id: string

  chunkType: ChunkType

  sourceDocumentId: string

  content: string

  metadata: ChunkMetadata

  payload: ChunkPayload

  // Cosine distance: 0 is identical, 2 is opposite. Distance rather than
  // a similarity score because that is what the index returns, and
  // converting it would invite comparing scores across different models.
  // Present when the hit came from vector search.
  distance?: number

  // Postgres `ts_rank`. Present when the hit came from lexical search.
  // Not comparable with `distance` in any direction — one is a distance
  // and one is a relevance score, on unrelated scales, which is exactly
  // why fusing them uses ranks rather than values.
  lexicalScore?: number

  // Reciprocal-rank-fusion score. Present only on hybrid results, where
  // it is the thing they are ordered by.
  fusedScore?: number
}

// The storage half of Phase 5, kept behind an interface so Phase 6 can be
// written against it and a different store can replace pgvector without
// touching anything above.
export interface VectorStore {
  upsertChunks(chunks: EmbeddingChunk[]): Promise<number>

  // Updates metadata and payload on chunks already stored, leaving their
  // vectors and content untouched.
  //
  // This exists because `contentHash` covers the embedded text and
  // nothing else — correctly, since that is all the vector depends on.
  // But it means a chunk whose *metadata* changed has an unchanged hash,
  // so the incremental path skips it and the row keeps metadata from a
  // previous version of the code, silently and forever. Re-embedding to
  // fix that would pay an API bill to rewrite a boolean.
  refreshMetadata(chunks: Chunk[]): Promise<number>

  searchSimilar(
    queryVector: number[],
    filter?: SearchFilter,
    limit?: number
  ): Promise<SearchHit[]>

  // Chunks matching a filter, with no query at all, in a stable order.
  //
  // Not every retrieval is a search. "Every learning objective under
  // topic 3" is a list, and phrasing it as a similarity query would
  // impose an arbitrary ranking on a set that has a natural one and
  // silently drop the tail.
  listChunks(filter?: SearchFilter, limit?: number): Promise<SearchHit[]>

  // Nearest neighbours of a chunk already in the store, found from its
  // stored vector without re-embedding anything.
  //
  // This is what lets generation run with no model call in the retrieval
  // path at all: to find questions that test a syllabus objective, use
  // the objective's own stored vector as the query. Cheaper than
  // embedding a paraphrase of it, and closer to the intent — the thing
  // being matched is the objective itself, not someone's description of
  // it. The chunk is excluded from its own results, which it would
  // otherwise top.
  searchSimilarToChunk(
    chunkId: string,
    filter?: SearchFilter,
    limit?: number
  ): Promise<SearchHit[]>

  // Full-text search over the same chunks, with the same filters.
  //
  // Not a fallback for when embeddings are unavailable — a complement.
  // A query naming a paper code, a nuclide, or a piece of apparatus is a
  // lookup, and a 768-dimension projection is lossy in exactly the way
  // that loses rare tokens. Whichever one is used alone has a blind spot
  // the other covers.
  searchLexical(
    queryText: string,
    filter?: SearchFilter,
    limit?: number
  ): Promise<SearchHit[]>

  // Removes chunks belonging to these source documents whose ids are not
  // in `keepIds`. Without it the store only ever grows: a question that
  // stops being produced — because it turned out to be a withdrawal
  // notice, or because a parser improved — keeps its row and keeps being
  // retrieved, and no amount of re-running fixes it. Returns the number
  // removed.
  deleteMissing(sourceDocumentIds: string[], keepIds: string[]): Promise<number>

  // Chunk id to content hash, for everything already stored for these
  // documents. Feeds `buildEmbeddingDocument`'s `known` map so a re-run
  // re-embeds only what changed.
  getStoredHashes(sourceDocumentIds: string[]): Promise<Map<string, string>>

  close(): Promise<void>
}
