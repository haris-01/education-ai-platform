import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { GeneratedPaper } from '@education-ai/exam-generation'

import type { PaperStore, StoredPaper } from '../types/paper-store'
import {
  PAPER_MIGRATIONS_DIR,
  createPgPaperStore,
} from './create-pg-paper-store'

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'
const TEST_SCHEMA = 'paper_store_test'

const databaseAvailable = await isReachable(CONNECTION_STRING)

function paper(overrides: Partial<GeneratedPaper> = {}): GeneratedPaper {
  return {
    syllabusCode: '0625',
    title: 'A generated paper',
    totalMarks: 8,
    questions: [
      {
        questionNumber: 1,
        topicNumber: 1,
        text: 'A trolley rolls down a ramp.',
        parts: [],
        options: [],
        marks: 8,
        assessmentObjective: 'AO1',
        difficulty: 'moderate',
        markScheme: [{ text: 'the answer', marks: 8 }],
        requiresDiagram: false,
        sourceChunkIds: ['chunk-1'],
      },
    ],
    generatorModel: 'fake-generator',
    generatedAt: new Date('2024-06-01T10:30:00Z'),
    ...overrides,
  }
}

function stored(id: string, overrides: Partial<StoredPaper> = {}): StoredPaper {
  return {
    id,
    paper: paper(),
    validation: { valid: true, violations: [] },
    originality: { findings: [], maxSimilarity: 0.1 },
    createdAt: new Date('2024-06-01T10:30:00Z'),
    ...overrides,
  }
}

describe.skipIf(!databaseAvailable)('pgPaperStore', () => {
  if (!databaseAvailable) {
    console.info('[paper-store.integration.test] skipped — no Postgres')
  }

  let store: PaperStore

  beforeAll(async () => {
    // Imported lazily so this package does not depend on vector-store
    // at runtime just to run its own migrations in a test.
    const { runMigrations } = await import('@education-ai/vector-store')
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
      migrationsDir: PAPER_MIGRATIONS_DIR,
    })
    store = createPgPaperStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    await truncate()
  }, 60000)

  afterAll(async () => {
    await store?.close()
    if (databaseAvailable) {
      await withClient((client) =>
        client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
      )
    }
  })

  it('round-trips a paper whole', async () => {
    await truncate()
    await store.save(stored('a'))

    const found = await store.find('a')

    expect(found?.paper.questions[0].text).toBe('A trolley rolls down a ramp.')
    expect(found?.paper.questions[0].markScheme[0].marks).toBe(8)
    expect(found?.validation.valid).toBe(true)
    expect(found?.originality.maxSimilarity).toBe(0.1)
  })

  it('returns generatedAt as a Date, not a string wearing its type', async () => {
    // JSONB loses Date. Without conversion at the boundary the first
    // code to call a Date method on it fails somewhere unrelated.
    await truncate()
    await store.save(stored('a'))

    const found = await store.find('a')

    expect(found?.paper.generatedAt).toBeInstanceOf(Date)
    expect(found?.paper.generatedAt.toISOString()).toBe(
      '2024-06-01T10:30:00.000Z'
    )
    expect(found?.createdAt).toBeInstanceOf(Date)
  })

  it('returns undefined for a paper that is not there', async () => {
    expect(await store.find('missing')).toBeUndefined()
  })

  it('treats saving the same id twice as a retry, not a second paper', async () => {
    await truncate()
    await store.save(stored('a'))
    await store.save(
      stored('a', { paper: paper({ title: 'Corrected title' }) })
    )

    expect((await store.find('a'))?.paper.title).toBe('Corrected title')
    expect(await countRows()).toBe(1)
  })

  it('lists summaries newest first', async () => {
    await truncate()
    await store.save(
      stored('older', { createdAt: new Date('2024-01-01T00:00:00Z') })
    )
    await store.save(
      stored('newer', { createdAt: new Date('2024-09-01T00:00:00Z') })
    )

    const list = await store.list()

    expect(list.map((entry) => entry.id)).toEqual(['newer', 'older'])
  })

  it('reads validity out of the stored report rather than recomputing it', async () => {
    // The validator will change; "did this pass when we shipped it"
    // has one answer and it is the one recorded at the time.
    await truncate()
    await store.save(
      stored('failing', {
        validation: {
          valid: false,
          violations: [
            { code: 'TOTAL_MARKS_MISMATCH', severity: 'error', message: 'no' },
          ],
        },
      })
    )

    expect((await store.list())[0].valid).toBe(false)
  })

  it('filters by syllabus', async () => {
    await truncate()
    await store.save(stored('physics'))
    await store.save(
      stored('chemistry', { paper: paper({ syllabusCode: '0620' }) })
    )

    expect((await store.list('0620')).map((e) => e.id)).toEqual(['chemistry'])
    expect(await store.list()).toHaveLength(2)
  })

  it('honours the list limit', async () => {
    await truncate()
    await Promise.all(
      Array.from({ length: 5 }, (_u, i) => store.save(stored(`p-${i}`)))
    )

    expect(await store.list(undefined, 2)).toHaveLength(2)
  })

  it('refuses a schema name that is not an identifier', () => {
    expect(() =>
      createPgPaperStore({
        connectionString: CONNECTION_STRING,
        schema: 'public; DROP TABLE generated_papers',
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
    client.query(`TRUNCATE ${TEST_SCHEMA}.generated_papers`)
  )
}

async function countRows(): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${TEST_SCHEMA}.generated_papers`
    )
    return Number(result.rows[0].count)
  })
}
