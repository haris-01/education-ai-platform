import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Chunk } from '@education-ai/embeddings'
import { createFakeEmbedder } from '@education-ai/embeddings'
import { createFakeGenerator } from '@education-ai/exam-generation'
import {
  TELEMETRY_MIGRATIONS_DIR,
  createPgTelemetryStore,
} from '@education-ai/ai-telemetry'
import type { TelemetryStore } from '@education-ai/ai-telemetry'
import {
  PAPER_MIGRATIONS_DIR,
  createPgPaperStore,
} from '@education-ai/paper-store'
import type { PaperStore } from '@education-ai/paper-store'
import type { VectorStore } from '@education-ai/vector-store'
import {
  createPgVectorStore,
  runMigrations,
  syncChunks,
} from '@education-ai/vector-store'
import type { FastifyInstance } from 'fastify'

import { buildServer } from './buildServer'

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'
const TEST_SCHEMA = 'api_test'

const databaseAvailable = await isReachable(CONNECTION_STRING)

const SPEC = {
  syllabusCode: '0625',
  title: 'Generated physics paper',
  totalMarks: 20,
  topics: [
    { topicNumber: 1, questionCount: 2 },
    { topicNumber: 3, questionCount: 2 },
  ],
}

describe.skipIf(!databaseAvailable)('api', () => {
  if (!databaseAvailable) {
    console.info('[api.integration.test] skipped — no Postgres')
  }

  let app: FastifyInstance
  let vectorStore: VectorStore
  let paperStore: PaperStore
  let telemetryStore: TelemetryStore

  beforeAll(async () => {
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
      migrationsDir: PAPER_MIGRATIONS_DIR,
    })
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
      migrationsDir: TELEMETRY_MIGRATIONS_DIR,
    })

    vectorStore = createPgVectorStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    paperStore = createPgPaperStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    telemetryStore = createPgTelemetryStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })

    await seedCorpus(vectorStore)

    app = buildServer({
      vectorStore,
      paperStore,
      telemetryStore,
      generator: createFakeGenerator(),
    })
  }, 120000)

  afterAll(async () => {
    await app?.close()
    await vectorStore?.close()
    await paperStore?.close()
    await telemetryStore?.close()
    if (databaseAvailable) {
      await withClient((client) =>
        client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
      )
    }
  })

  it('reports model usage, separating waiting from working', async () => {
    // The share of wall clock spent waiting out rate limits is the most
    // useful number this system produces about itself: above about
    // half, the limit is the bottleneck and optimising code will not
    // help.
    await telemetryStore.record({
      path: 'models/gemini-embedding-001:batchEmbedContents',
      operation: 'embed',
      outcome: 'ok',
      durationMs: 300_000,
      waitedMs: 280_000,
      attempts: 6,
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/telemetry/usage?hours=24',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json().data
    expect(body.operations[0].operation).toBe('embed')
    expect(body.totals.waitedShare).toBeGreaterThan(0.9)
  })

  it('clamps a nonsense telemetry window rather than refusing it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/telemetry/usage?hours=notanumber',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.windowHours).toBe(24)
  })

  it('reports health without touching the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.status).toBe('ok')
  })

  it('generates, validates and stores a paper', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: SPEC,
    })

    expect(response.statusCode).toBe(201)

    const body = response.json()
    expect(body.meta.operation).toBe('paper.generated')
    expect(body.data.paper.questions).toHaveLength(4)
    expect(body.data.paper.totalMarks).toBe(20)
    expect(body.data.validation.valid).toBe(true)
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns a stored paper by id, with its dates intact', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: SPEC,
    })
    const { id } = created.json().data

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/papers/${id}`,
    })

    expect(fetched.statusCode).toBe(200)
    expect(fetched.json().data.paper.title).toBe('Generated physics paper')
    // JSONB loses Date, and a string wearing a Date's type fails later
    // somewhere unrelated.
    expect(new Date(fetched.json().data.paper.generatedAt).toString()).not.toBe(
      'Invalid Date'
    )
  })

  it('lists papers, newest first', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/papers' })

    expect(response.statusCode).toBe(200)
    const summaries = response.json().data
    expect(summaries.length).toBeGreaterThan(0)
    expect(summaries[0]).toMatchObject({
      syllabusCode: '0625',
      valid: true,
      generatorModel: 'fake-generator',
    })
  })

  it('serves the paper as a PDF, not as JSON around base64', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: SPEC,
    })
    const { id } = created.json().data

    const pdf = await app.inject({
      method: 'GET',
      url: `/api/papers/${id}/paper.pdf`,
    })

    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  }, 30000)

  it('serves the mark scheme separately from the paper', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: SPEC,
    })
    const { id } = created.json().data

    const scheme = await app.inject({
      method: 'GET',
      url: `/api/papers/${id}/mark-scheme.pdf`,
    })

    expect(scheme.statusCode).toBe(200)
    expect(scheme.headers['content-disposition']).toContain('-mark-scheme.pdf')
  }, 30000)

  it('rejects an invalid body with field-level detail', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: { syllabusCode: '', totalMarks: -5, topics: [] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('REQUEST_VALIDATION_FAILED')
    expect(response.json().details.fieldErrors).toBeDefined()
  })

  it('answers a missing paper with a stable code, not just a 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/papers/00000000-0000-0000-0000-000000000000',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('PAPER_NOT_FOUND')
  })

  it('refuses to generate from a topic the corpus does not cover', async () => {
    // Generating anyway would invent a paper from the prompt alone,
    // which is what this system exists not to do.
    const response = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: { ...SPEC, topics: [{ topicNumber: 42, questionCount: 2 }] },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe('CORPUS_EMPTY')
    expect(response.json().reasons.join(' ')).toContain('Topic 42')
  })

  it('does not let a client set fields the server owns', async () => {
    // A write API that accepts its own outputs invites a client to
    // drive state the server owns.
    const response = await app.inject({
      method: 'POST',
      url: '/api/papers/generate',
      payload: {
        ...SPEC,
        id: 'client-chosen-id',
        generatorModel: 'client-chosen-model',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().data.id).not.toBe('client-chosen-id')
    expect(response.json().data.paper.generatorModel).toBe('fake-generator')
  })
})

async function seedCorpus(store: VectorStore): Promise<void> {
  const chunks: Chunk[] = [1, 3].flatMap((topicNumber) => [
    chunk(
      `obj-${topicNumber}`,
      topicNumber,
      'learningObjective',
      'an objective'
    ),
    chunk(`q-${topicNumber}-a`, topicNumber, 'question', 'a real question'),
    chunk(`q-${topicNumber}-b`, topicNumber, 'question', 'another question'),
  ])

  await syncChunks({
    resourceId: 'TEST-PAPER',
    title: 'seed',
    chunks,
    embedder: createFakeEmbedder(768),
    store,
  })
}

function chunk(
  id: string,
  topicNumber: number,
  chunkType: Chunk['chunkType'],
  content: string
): Chunk {
  return {
    id,
    chunkType,
    sourceDocumentId: 'TEST-PAPER',
    content: `Header\n\n${content} ${id}`,
    contentHash: `hash:${id}`,
    metadata: {
      syllabusCode: '0625',
      topicNumber,
      assessmentObjectives: [],
      hasDiagram: false,
      isExemplar: true,
    },
    payload: {},
  }
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
