import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { VectorStore } from './types/vector-store'
import { createPgVectorStore } from './pipeline/create-pg-vector-store'
import { runMigrations } from './pipeline/run-migrations'
import { axisVector, embeddingChunk, tiltedVector } from './test-fixtures'

// Runs against a real Postgres, because the reason for choosing pgvector
// over a file of vectors is behaviour a mock cannot show: HNSW ordering,
// SQL filtering combined with ranking, and ON CONFLICT upserts. Start it
// with `pnpm db:up`.
//
// Skipped loudly rather than failed when the database is not up, so a
// fresh clone with no Docker still gets a green suite — same reasoning
// as the dataset guards on every corpus test in this repo.
const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'

// A throwaway schema, so a test run never touches a developer's own rows.
const TEST_SCHEMA = 'vector_store_test'

const databaseAvailable = await isReachable(CONNECTION_STRING)

describe.skipIf(!databaseAvailable)('pgvector store', () => {
  if (!databaseAvailable) {
    console.info(
      `[store.integration.test] skipped — no Postgres at ${redact(CONNECTION_STRING)}. Run \`pnpm db:up\`.`
    )
  }

  let store: VectorStore

  beforeAll(async () => {
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    store = createPgVectorStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    await truncate()
  }, 60000)

  afterAll(async () => {
    await store?.close()
    await dropSchema()
  })

  it('round-trips a chunk through a real vector column', async () => {
    await truncate()
    const chunk = embeddingChunk('doc:question:1', axisVector(0), {
      content: 'Calculate the resultant force on the mass.',
      metadata: {
        syllabusCode: '0625',
        paperCode: '41',
        questionNumber: 1,
        topicNumber: 1,
        topicName: 'Motion, forces and energy',
        assessmentObjectives: ['AO1', 'AO2'],
        primaryAssessmentObjective: 'AO2',
        difficulty: 'high',
        marks: 6,
        hasDiagram: true,
        isExemplar: true,
      },
      payload: { correctAnswer: 'B', commonMistakes: ['wrong equation'] },
    })

    expect(await store.upsertChunks([chunk])).toBe(1)

    const [hit] = await store.searchSimilar(axisVector(0))

    expect(hit.id).toBe('doc:question:1')
    expect(hit.content).toBe('Calculate the resultant force on the mass.')
    expect(hit.metadata).toEqual(chunk.metadata)
    expect(hit.payload).toEqual(chunk.payload)
    expect(hit.distance).toBeCloseTo(0, 5)
  })

  it('returns NULL columns as undefined, not null', async () => {
    // The chunk contract uses `undefined` for an absent value; Postgres
    // returns NULL. Converting at the boundary keeps every consumer from
    // having to handle both.
    await truncate()
    await store.upsertChunks([
      embeddingChunk('doc:learningObjective:1.5.1', axisVector(1), {
        chunkType: 'learningObjective',
        metadata: {
          topicNumber: 1,
          subTopicNumber: '1.5',
          sectionNumber: '1.5.1',
          tier: 'core',
          assessmentObjectives: [],
          hasDiagram: false,
          isExemplar: true,
        },
      }),
    ])

    const [hit] = await store.searchSimilar(axisVector(1))

    expect(hit.metadata.paperCode).toBeUndefined()
    expect(hit.metadata.marks).toBeUndefined()
    expect(hit.metadata.difficulty).toBeUndefined()
    expect(hit.metadata.tier).toBe('core')
  })

  it('orders by cosine distance, not by insertion order', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('far', axisVector(5)),
      embeddingChunk('near', axisVector(0)),
      embeddingChunk('middling', tiltedVector(5, 0, 0.6)),
    ])

    const hits = await store.searchSimilar(axisVector(0))

    expect(hits.map((hit) => hit.id)).toEqual(['near', 'middling', 'far'])

    // Ascending, and every hit from a vector search carries one.
    const distances = hits.map((hit) => hit.distance ?? Number.NaN)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    expect(distances.some(Number.isNaN)).toBe(false)
  })

  it('filters and ranks in one query', async () => {
    // The whole reason for a vector database rather than a file of
    // vectors: the nearest chunk is not the answer if it is the wrong
    // kind of chunk.
    await truncate()
    await store.upsertChunks([
      embeddingChunk('objective', axisVector(0), {
        chunkType: 'learningObjective',
        metadata: {
          assessmentObjectives: [],
          hasDiagram: false,
          isExemplar: true,
        },
      }),
      embeddingChunk('question', tiltedVector(1, 0, 0.9)),
    ])

    const hits = await store.searchSimilar(axisVector(0), {
      chunkTypes: ['question'],
    })

    expect(hits.map((hit) => hit.id)).toEqual(['question'])
  })

  it('applies every metadata filter against real rows', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('q-easy', axisVector(0), {
        metadata: {
          syllabusCode: '0625',
          paperCode: '11',
          topicNumber: 1,
          assessmentObjectives: ['AO1'],
          difficulty: 'low',
          marks: 1,
          hasDiagram: false,
          isExemplar: true,
        },
      }),
      embeddingChunk('q-hard', axisVector(1), {
        sourceDocumentId: 'CAM-0625-MJ-2024-41-QP',
        metadata: {
          syllabusCode: '0625',
          paperCode: '41',
          topicNumber: 3,
          assessmentObjectives: ['AO2', 'AO3'],
          difficulty: 'high',
          marks: 6,
          hasDiagram: true,
          isExemplar: true,
        },
      }),
    ])

    const byTopic = await store.searchSimilar(axisVector(0), {
      topicNumbers: [3],
    })
    const byMarks = await store.searchSimilar(axisVector(0), { minMarks: 4 })
    const byObjective = await store.searchSimilar(axisVector(0), {
      assessmentObjectives: ['AO3'],
    })
    const byDiagram = await store.searchSimilar(axisVector(0), {
      hasDiagram: false,
    })
    const byPaper = await store.searchSimilar(axisVector(0), {
      paperCodes: ['11'],
    })

    expect(byTopic.map((h) => h.id)).toEqual(['q-hard'])
    expect(byMarks.map((h) => h.id)).toEqual(['q-hard'])
    expect(byObjective.map((h) => h.id)).toEqual(['q-hard'])
    expect(byDiagram.map((h) => h.id)).toEqual(['q-easy'])
    expect(byPaper.map((h) => h.id)).toEqual(['q-easy'])
  })

  it('excludes a source document, which is how Phase 7 avoids copying', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('from-41', axisVector(0), {
        sourceDocumentId: 'CAM-0625-MJ-2024-41-QP',
      }),
      embeddingChunk('from-21', axisVector(1), {
        sourceDocumentId: 'CAM-0625-MJ-2024-21-QP',
      }),
    ])

    const hits = await store.searchSimilar(axisVector(0), {
      excludeSourceDocumentIds: ['CAM-0625-MJ-2024-41-QP'],
    })

    expect(hits.map((h) => h.id)).toEqual(['from-21'])
  })

  it('keeps non-exemplar chunks searchable but excludable', async () => {
    // Both halves matter. A multiple-choice question whose options were
    // never extracted is still real content and a reader searching for
    // it should find it; a generator asking for something to imitate
    // must not be handed it.
    await truncate()
    await store.upsertChunks([
      embeddingChunk('incomplete', axisVector(0), {
        metadata: {
          assessmentObjectives: [],
          hasDiagram: true,
          isExemplar: false,
        },
      }),
      embeddingChunk('complete', tiltedVector(1, 0, 0.9)),
    ])

    const forReading = await store.searchSimilar(axisVector(0))
    const forGenerating = await store.searchSimilar(axisVector(0), {
      exemplarsOnly: true,
    })

    expect(forReading.map((hit) => hit.id)).toEqual(['incomplete', 'complete'])
    expect(forGenerating.map((hit) => hit.id)).toEqual(['complete'])
    expect(forReading[0].metadata.isExemplar).toBe(false)
  })

  it('records which migrations it applied, and applies each only once', async () => {
    const again = await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })

    // beforeAll already ran them, so a second run has nothing to do.
    expect(again).toEqual([])
  })

  it('finds an exact token that a vector search would blur away', async () => {
    // The case that justifies a second index. "thallium-208" is a token
    // that either appears or does not; a 768-dimension projection keeps
    // "radioactive decay" and loses the nuclide.
    await truncate()
    await store.upsertChunks([
      embeddingChunk('thallium', axisVector(0), {
        content:
          'The isotope thallium-208 is radioactive. It decays by beta-emission.',
      }),
      embeddingChunk('unrelated', axisVector(1), {
        content: 'A trolley rolls down a ramp and accelerates uniformly.',
      }),
    ])

    const hits = await store.searchLexical('thallium')

    expect(hits.map((hit) => hit.id)).toEqual(['thallium'])
    expect(hits[0].lexicalScore).toBeGreaterThan(0)
    expect(hits[0].distance).toBeUndefined()
  })

  it('stems, so a query need not match the printed word exactly', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('decay', axisVector(0), {
        content: 'The isotope decays by beta-emission over several half-lives.',
      }),
    ])

    expect(await store.searchLexical('decay')).toHaveLength(1)
    expect(await store.searchLexical('isotopes')).toHaveLength(1)
  })

  it('misses an irregular plural inside a hyphenated word, which is why hybrid exists', async () => {
    // Not a defect to fix here — a fact about Snowball stemming, and the
    // clearest demonstration of why neither ranker is used alone.
    // "half-lives" stems to 'half-liv'/'live' and "half-life" to
    // 'half-lif'/'life': different tokens, no lexical match, however
    // obviously the same idea. The vector side closes exactly this gap,
    // just as the lexical side closes the rare-token gap vectors leave.
    await truncate()
    await store.upsertChunks([
      embeddingChunk('decay', axisVector(0), {
        content: 'The isotope decays by beta-emission over several half-lives.',
      }),
    ])

    expect(await store.searchLexical('half-life')).toEqual([])
    expect(await store.searchSimilar(axisVector(0))).toHaveLength(1)
  })

  it('applies the same filters to lexical search as to vector search', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('good', axisVector(0), {
        content: 'A magnet is placed between two poles.',
      }),
      embeddingChunk('incomplete', axisVector(1), {
        content: 'A magnet is placed between two poles.',
        metadata: {
          assessmentObjectives: [],
          hasDiagram: true,
          isExemplar: false,
        },
      }),
    ])

    const all = await store.searchLexical('magnet')
    const exemplars = await store.searchLexical('magnet', {
      exemplarsOnly: true,
    })

    expect(all).toHaveLength(2)
    expect(exemplars.map((hit) => hit.id)).toEqual(['good'])
  })

  it('returns nothing rather than everything for an unmatched query', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('a', axisVector(0), { content: 'A trolley on a ramp.' }),
    ])

    expect(await store.searchLexical('photosynthesis')).toEqual([])
  })

  it('finds neighbours of a stored chunk without re-embedding', async () => {
    // What lets generation retrieve with no model call: the seed
    // vector is already in the table, so it is read in a subquery
    // rather than fetched, re-embedded, and sent back.
    await truncate()
    await store.upsertChunks([
      embeddingChunk('seed', axisVector(0)),
      embeddingChunk('near', tiltedVector(0, 3, 0.2)),
      embeddingChunk('far', axisVector(7)),
    ])

    const hits = await store.searchSimilarToChunk('seed')

    // The seed would top its own results, which is never what was meant.
    expect(hits.map((hit) => hit.id)).toEqual(['near', 'far'])
    expect(hits[0].distance).toBeLessThan(hits[1].distance ?? Infinity)
  })

  it('applies filters to a more-like-this search', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('seed', axisVector(0), {
        chunkType: 'learningObjective',
      }),
      embeddingChunk('question', tiltedVector(0, 3, 0.2)),
      embeddingChunk('other-objective', tiltedVector(0, 4, 0.2), {
        chunkType: 'learningObjective',
      }),
    ])

    const hits = await store.searchSimilarToChunk('seed', {
      chunkTypes: ['question'],
    })

    expect(hits.map((hit) => hit.id)).toEqual(['question'])
  })

  it('returns nothing for a chunk id that is not stored', async () => {
    await truncate()
    await store.upsertChunks([embeddingChunk('a', axisVector(0))])

    expect(await store.searchSimilarToChunk('missing')).toEqual([])
  })

  it('honours the limit', async () => {
    await truncate()
    await store.upsertChunks(
      Array.from({ length: 12 }, (_unused, i) =>
        embeddingChunk(`q-${i}`, axisVector(i))
      )
    )

    expect(await store.searchSimilar(axisVector(0), undefined, 5)).toHaveLength(
      5
    )
  })

  it('upserts in place, so a re-run does not duplicate a paper', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('doc:question:1', axisVector(0), { content: 'first' }),
    ])
    await store.upsertChunks([
      embeddingChunk('doc:question:1', axisVector(1), {
        content: 'second',
        contentHash: 'hash-second',
      }),
    ])

    const hits = await store.searchSimilar(axisVector(1))

    expect(hits).toHaveLength(1)
    expect(hits[0].content).toBe('second')
    expect(hits[0].distance).toBeCloseTo(0, 5)
    expect(await countRows()).toBe(1)
  })

  it('reports stored hashes so a re-run re-embeds only what changed', async () => {
    await truncate()
    await store.upsertChunks([
      embeddingChunk('doc:question:1', axisVector(0)),
      embeddingChunk('doc:question:2', axisVector(1)),
      embeddingChunk('other:question:1', axisVector(2), {
        sourceDocumentId: 'CAM-0625-MJ-2024-21-QP',
      }),
    ])

    const hashes = await store.getStoredHashes(['CAM-0625-MJ-2024-41-QP'])

    expect(hashes.size).toBe(2)
    expect(hashes.get('doc:question:1')).toBe('hash-doc:question:1')
    expect(hashes.get('other:question:1')).toBeUndefined()
  })

  it('does nothing, cheaply, for an empty write or read', async () => {
    expect(await store.upsertChunks([])).toBe(0)
    expect(await store.getStoredHashes([])).toEqual(new Map())
  })

  it('rolls back a batch when one chunk in it is invalid', async () => {
    // A half-written paper is worse than a failed one: the next run
    // would see stored hashes for chunks whose neighbours never landed.
    await truncate()

    await expect(
      store.upsertChunks([
        embeddingChunk('good', axisVector(0)),
        embeddingChunk('bad', axisVector(1), {
          chunkType: 'notAChunkType' as never,
        }),
      ])
    ).rejects.toThrow()

    expect(await countRows()).toBe(0)
  })

  it('refuses a schema name that is not an identifier', () => {
    // The schema is interpolated, not bound, because an identifier
    // cannot be a parameter — so it is validated instead.
    expect(() =>
      createPgVectorStore({
        connectionString: CONNECTION_STRING,
        schema: 'public; DROP TABLE embedding_chunks',
      })
    ).toThrow('Invalid schema name')
  })
})

async function isReachable(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    return false
  }
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function truncate(): Promise<void> {
  await withClient((client) =>
    client.query(`TRUNCATE ${TEST_SCHEMA}.embedding_chunks`)
  )
}

async function countRows(): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${TEST_SCHEMA}.embedding_chunks`
    )
    return Number(result.rows[0].count)
  })
}

async function dropSchema(): Promise<void> {
  if (!databaseAvailable) {
    return
  }
  await withClient((client) =>
    client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
  )
}

function redact(connectionString: string): string {
  return connectionString.replace(/\/\/[^@]*@/, '//***@')
}
