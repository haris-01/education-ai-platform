import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Chunk } from '@education-ai/embeddings'
import { createFakeEmbedder } from '@education-ai/embeddings'

import type { VectorStore } from '../types/vector-store'
import { createPgVectorStore } from './create-pg-vector-store'
import { runMigrations } from './run-migrations'
import { syncChunks } from './sync-chunks'

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'
const TEST_SCHEMA = 'sync_chunks_test'

const databaseAvailable = await isReachable(CONNECTION_STRING)

function chunk(
  id: string,
  content: string,
  overrides: Partial<Chunk> = {}
): Chunk {
  return {
    id,
    chunkType: 'question',
    sourceDocumentId: 'PAPER-41',
    content,
    contentHash: `hash:${content}`,
    metadata: { assessmentObjectives: [], hasDiagram: false, isExemplar: true },
    payload: {},
    ...overrides,
  }
}

describe.skipIf(!databaseAvailable)('syncChunks', () => {
  if (!databaseAvailable) {
    console.info('[sync-chunks.integration.test] skipped — no Postgres')
  }

  let store: VectorStore
  const embedder = createFakeEmbedder(768)

  beforeAll(async () => {
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    store = createPgVectorStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
  }, 60000)

  afterAll(async () => {
    await store?.close()
    if (databaseAvailable) {
      await withClient((client) =>
        client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
      )
    }
  })

  async function sync(chunks: Chunk[]) {
    return syncChunks({
      resourceId: 'PAPER-41',
      title: 'June 2024 Paper 41',
      chunks,
      embedder,
      store,
    })
  }

  it('embeds everything on a first run', async () => {
    await truncate()

    const report = await sync([chunk('a', 'first'), chunk('b', 'second')])

    expect(report).toMatchObject({
      total: 2,
      embedded: 2,
      refreshed: 0,
      removed: 0,
    })
    expect(await countRows()).toBe(2)
  })

  it('is a no-op the second time, which is what makes it safe to re-run', async () => {
    await truncate()
    const chunks = [chunk('a', 'first'), chunk('b', 'second')]
    await sync(chunks)

    const report = await sync(chunks)

    expect(report).toMatchObject({ total: 2, embedded: 0, removed: 0 })
    expect(report.refreshed).toBe(2)
    expect(await countRows()).toBe(2)
  })

  it('updates metadata without re-embedding when only metadata changed', async () => {
    // The bug this was written for: contentHash covers the embedded text
    // alone, so a chunk whose exemplar flag changed has an unchanged
    // hash. Without an explicit refresh the row keeps the old value
    // forever, and re-embedding to fix it would pay an API bill to
    // rewrite a boolean.
    await truncate()
    await sync([chunk('a', 'first')])

    const report = await sync([
      chunk('a', 'first', {
        metadata: {
          assessmentObjectives: ['AO2'],
          hasDiagram: true,
          isExemplar: false,
          topicNumber: 3,
        },
      }),
    ])

    expect(report.embedded).toBe(0)
    expect(report.refreshed).toBe(1)

    const [hit] = await store.searchSimilar(await vectorFor('first'))
    expect(hit.metadata.isExemplar).toBe(false)
    expect(hit.metadata.topicNumber).toBe(3)
    expect(hit.metadata.assessmentObjectives).toEqual(['AO2'])
  })

  it('re-embeds when the text changed under the same id', async () => {
    await truncate()
    await sync([chunk('a', 'first')])

    const report = await sync([chunk('a', 'rewritten')])

    expect(report.embedded).toBe(1)
    expect(await countRows()).toBe(1)

    const [hit] = await store.searchSimilar(await vectorFor('rewritten'))
    expect(hit.content).toBe('rewritten')
    expect(hit.distance).toBeCloseTo(0, 5)
  })

  it('removes rows the pipeline no longer produces', async () => {
    // The withdrawn-question case: once the parser learned to recognise
    // a withdrawal notice it stopped chunking it, and without this the
    // row stayed in the store and stayed retrievable forever.
    await truncate()
    await sync([chunk('a', 'first'), chunk('withdrawn', 'removed notice')])

    const report = await sync([chunk('a', 'first')])

    expect(report.removed).toBe(1)
    expect(await countRows()).toBe(1)
  })

  it('does not touch documents it was not given', async () => {
    // syncChunks makes the store match its input for the documents that
    // input covers — and must leave every other paper alone.
    await truncate()
    await sync([chunk('a', 'first')])
    await syncChunks({
      resourceId: 'PAPER-11',
      title: 'June 2024 Paper 11',
      chunks: [chunk('x', 'other paper', { sourceDocumentId: 'PAPER-11' })],
      embedder,
      store,
    })

    const report = await sync([chunk('a', 'first')])

    expect(report.removed).toBe(0)
    expect(await countRows()).toBe(2)
  })

  it('handles an empty chunk list without deleting the world', async () => {
    await truncate()
    await sync([chunk('a', 'first')])

    const report = await sync([])

    // No source documents named, so nothing is in scope to remove.
    expect(report).toMatchObject({ total: 0, embedded: 0, removed: 0 })
    expect(await countRows()).toBe(1)
  })
})

async function vectorFor(text: string): Promise<number[]> {
  const [vector] = await createFakeEmbedder(768).embed([text], 'document')
  return vector
}

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
