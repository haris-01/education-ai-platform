import { describe, expect, it, vi } from 'vitest'

import type { SearchHit, VectorStore } from '../types/vector-store'
import { searchHybrid } from './search-hybrid'

function hit(id: string, extra: Partial<SearchHit> = {}): SearchHit {
  return {
    id,
    chunkType: 'question',
    sourceDocumentId: 'PAPER-41',
    content: `content ${id}`,
    metadata: { assessmentObjectives: [], hasDiagram: false, isExemplar: true },
    payload: {},
    ...extra,
  }
}

function storeReturning(
  semantic: SearchHit[],
  lexical: SearchHit[]
): VectorStore {
  return {
    listChunks: vi.fn(async () => []),
    searchSimilar: vi.fn(async () => semantic),
    searchSimilarToChunk: vi.fn(async () => semantic),
    searchLexical: vi.fn(async () => lexical),
    upsertChunks: vi.fn(async () => 0),
    refreshMetadata: vi.fn(async () => 0),
    deleteMissing: vi.fn(async () => 0),
    getStoredHashes: vi.fn(async () => new Map()),
    close: vi.fn(async () => undefined),
  }
}

const QUERY = { queryVector: [1, 0], queryText: 'refraction' }

describe('searchHybrid', () => {
  it('ranks a result both searches agree on above either search alone', () => {
    // The whole reason for fusing. "b" is second on both lists and first
    // on neither, so any single ranker misses it.
    const store = storeReturning(
      [hit('a'), hit('b'), hit('c')],
      [hit('d'), hit('b'), hit('e')]
    )

    return searchHybrid({ store, ...QUERY }).then((hits) => {
      expect(hits[0].id).toBe('b')
    })
  })

  it('keeps results found by only one ranker', async () => {
    // A lookup like a nuclide name is found by text and missed by
    // vectors; dropping it would defeat the point of running both.
    const store = storeReturning([hit('semantic-only')], [hit('lexical-only')])

    const hits = await searchHybrid({ store, ...QUERY })

    expect(hits.map((h) => h.id).sort()).toEqual([
      'lexical-only',
      'semantic-only',
    ])
  })

  it('reports both measures for a chunk found by both', async () => {
    const store = storeReturning(
      [hit('b', { distance: 0.31 })],
      [hit('b', { lexicalScore: 0.09 })]
    )

    const [fused] = await searchHybrid({ store, ...QUERY })

    expect(fused.distance).toBe(0.31)
    expect(fused.lexicalScore).toBe(0.09)
    expect(fused.fusedScore).toBeGreaterThan(0)
  })

  it('fuses on rank, not on score', async () => {
    // ts_rank has no fixed upper bound and cosine distance is a
    // distance. Any attempt to put them on one scale is a guess about
    // the corpus; a huge lexical score must not outrank agreement.
    const store = storeReturning(
      [hit('agreed'), hit('semantic-first')],
      [hit('huge-score', { lexicalScore: 9999 }), hit('agreed')]
    )

    const hits = await searchHybrid({ store, ...QUERY })

    expect(hits[0].id).toBe('agreed')
  })

  it('orders strictly by fused score', async () => {
    const store = storeReturning(
      [hit('a'), hit('b'), hit('c')],
      [hit('c'), hit('b'), hit('a')]
    )

    const hits = await searchHybrid({ store, ...QUERY })
    const scores = hits.map((h) => h.fusedScore ?? 0)

    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('looks deeper than it returns, so agreement below the cut is visible', async () => {
    const store = storeReturning([hit('a')], [hit('a')])

    await searchHybrid({ store, ...QUERY, limit: 5 })

    expect(store.searchSimilar).toHaveBeenCalledWith([1, 0], undefined, 40)
    expect(store.searchLexical).toHaveBeenCalledWith(
      'refraction',
      undefined,
      40
    )
  })

  it('honours the requested limit', async () => {
    const many = Array.from({ length: 30 }, (_u, i) => hit(`s${i}`))
    const store = storeReturning(many, [])

    expect(await searchHybrid({ store, ...QUERY, limit: 5 })).toHaveLength(5)
  })

  it('passes the filter to both rankers', async () => {
    const store = storeReturning([], [])
    const filter = { chunkTypes: ['question' as const], exemplarsOnly: true }

    await searchHybrid({ store, ...QUERY, filter })

    expect(store.searchSimilar).toHaveBeenCalledWith([1, 0], filter, 40)
    expect(store.searchLexical).toHaveBeenCalledWith('refraction', filter, 40)
  })

  it('returns nothing when neither ranker finds anything', async () => {
    expect(
      await searchHybrid({ store: storeReturning([], []), ...QUERY })
    ).toEqual([])
  })
})
