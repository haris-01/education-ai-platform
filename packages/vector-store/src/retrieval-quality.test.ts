import { existsSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Chunk, Embedder } from '@education-ai/embeddings'
import {
  buildEmbeddingDocument,
  chunkLearningObjectives,
  chunkQuestions,
  createGeminiEmbedder,
} from '@education-ai/embeddings'
import { assembleKnowledgeDocument } from '@education-ai/knowledge-builder'
import { loadWorkspaceEnv, resolveWorkspaceRoot } from '@education-ai/shared'

import type { VectorStore } from './types/vector-store'
import { createPgVectorStore } from './pipeline/create-pg-vector-store'
import { runMigrations } from './pipeline/run-migrations'

// The one suite in this repo that costs money and needs the network, and
// the only one that can measure retrieval *quality* — the fake embedder
// is deterministic, not semantic, so it cannot stand in here.
//
// Opt-in by an explicit flag, not merely by a key being present. Keying
// it off GEMINI_API_KEY meant `pnpm test` started making paced API calls
// the moment someone put a key in .env, so the default test run's result
// depended on how much of a rate limit was left — green or red according
// to what had run before it. A test suite has to be deterministic to be
// worth anything, so this one has to be asked for:
//
//   RUN_RETRIEVAL_QUALITY=1 pnpm --filter @education-ai/vector-store test
loadWorkspaceEnv()

const OPTED_IN = process.env.RUN_RETRIEVAL_QUALITY === '1'
const API_KEY = process.env.GEMINI_API_KEY
const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'
const TEST_SCHEMA = 'retrieval_quality_test'

const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const SESSION_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj'
)
const SYLLABUS_PDF = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'
)
const SYLLABUS_RESOURCE_ID = 'CAM-0625-SYLLABUS-2023-2025'

const PAPERS = [
  {
    code: '0625/11',
    questionPaperPdfPath: path.join(
      SESSION_ROOT,
      '11/570010-june-2024-question-paper-11.pdf'
    ),
    markSchemePdfPath: path.join(
      SESSION_ROOT,
      '11/570004-june-2024-mark-scheme-paper-11.pdf'
    ),
    markSchemeType: 'mcq' as const,
  },
  {
    code: '0625/41',
    questionPaperPdfPath: path.join(
      SESSION_ROOT,
      '41/671385-june-2024-question-paper-41.pdf'
    ),
    markSchemePdfPath: path.join(
      SESSION_ROOT,
      '41/671373-june-2024-mark-scheme-paper-41.pdf'
    ),
    markSchemeType: 'theory' as const,
  },
]

// Written before any retrieval was run, so these measure the pipeline
// rather than describe what it happened to return. Each is a question a
// teacher might type, paired with the 0625 topic it belongs to.
const GOLDEN_QUERIES = [
  { query: 'how light bends when it enters glass', topicNumber: 3 },
  { query: 'calculating the resultant of two forces', topicNumber: 1 },
  { query: 'why does a parachutist reach terminal velocity', topicNumber: 1 },
  { query: 'what happens to particles when a solid melts', topicNumber: 2 },
  { query: 'series and parallel resistor combinations', topicNumber: 4 },
  { query: 'half-life of a radioactive isotope', topicNumber: 5 },
  { query: 'how a transformer changes voltage', topicNumber: 4 },
  { query: 'the difference between speed and velocity', topicNumber: 1 },
  { query: 'energy transfer in a pendulum swing', topicNumber: 1 },
  { query: 'how sound travels through different materials', topicNumber: 3 },
  { query: 'magnetic field around a current-carrying wire', topicNumber: 4 },
  { query: 'measuring specific heat capacity of a metal', topicNumber: 2 },
  { query: 'the structure of the solar system', topicNumber: 6 },
  { query: 'converting between kinetic and potential energy', topicNumber: 1 },
  { query: 'what a thermistor does as it gets hotter', topicNumber: 4 },
]

const datasetAvailable = [
  SYLLABUS_PDF,
  ...PAPERS.flatMap((p) => [p.questionPaperPdfPath, p.markSchemePdfPath]),
].every(existsSync)
const databaseAvailable = await isReachable(CONNECTION_STRING)
const runnable =
  OPTED_IN && Boolean(API_KEY) && datasetAvailable && databaseAvailable

describe.skipIf(!runnable)('retrieval quality', () => {
  if (!runnable) {
    console.info(
      '[retrieval-quality.test] skipped — ' +
        `opted-in:${OPTED_IN} key:${Boolean(API_KEY)} ` +
        `dataset:${datasetAvailable} database:${databaseAvailable}. ` +
        'Run with RUN_RETRIEVAL_QUALITY=1 to measure retrieval.'
    )
  }

  let store: VectorStore

  // Everything that costs an API call happens in the hook, once. The
  // first version embedded queries inside each test, which made every
  // test's duration depend on how much of the minute's quota was left —
  // so the suite failed or passed according to what had run before it.
  // A test whose result depends on the rate limiter is not measuring
  // what it claims to.
  let goldenVectors: number[][]
  let selfVector: number[]
  let selfChunk: Chunk
  let objectiveProbe: { chunk: Chunk; vector: number[] }[]

  beforeAll(async () => {
    // 900s: parses four PDFs plus the syllabus, then embeds ~370 chunks
    // and ~36 queries against a free tier that allows 100 requests a
    // minute and counts each text as one — so the pacing alone is
    // several minutes, and a hook that times out fails the whole suite
    // rather than one case.
    const embedder: Embedder = createGeminiEmbedder({
      apiKey: API_KEY ?? '',
      onWait: (reason, ms) =>
        console.info(
          `[retrieval-quality] waiting ${(ms / 1000).toFixed(0)}s — ${reason}`
        ),
    })

    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    store = createPgVectorStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })

    const documents = await Promise.all(
      PAPERS.map((paper) =>
        assembleKnowledgeDocument({
          questionPaperPdfPath: paper.questionPaperPdfPath,
          markSchemePdfPath: paper.markSchemePdfPath,
          markSchemeType: paper.markSchemeType,
          syllabusPdfPath: SYLLABUS_PDF,
        })
      )
    )

    const questionChunks = documents.flatMap((document) =>
      chunkQuestions(document)
    )
    const objectiveChunks = chunkLearningObjectives(
      documents[0],
      SYLLABUS_RESOURCE_ID
    )
    const allChunks = [...questionChunks, ...objectiveChunks]

    const embedded = await buildEmbeddingDocument({
      resourceId: 'CAM-0625-MJ-2024',
      title: 'Cambridge IGCSE Physics 0625, June 2024',
      chunks: allChunks,
      embedder,
      storedHashes: await store.getStoredHashes([
        ...new Set(allChunks.map((c) => c.sourceDocumentId)),
      ]),
    })

    await store.upsertChunks(embedded.chunks)

    const substantial = questionChunks.filter(
      (chunk) =>
        chunk.metadata.topicNumber !== undefined && chunk.content.length > 300
    )
    const sample = substantial.slice(0, 20)
    const found = questionChunks.find((chunk) => chunk.content.length > 400)

    if (!found) {
      throw new Error('No question chunk long enough to use as a self-query')
    }
    selfChunk = found

    // One batched call for every query the suite will make.
    const queries = [
      ...GOLDEN_QUERIES.map((entry) => entry.query),
      selfChunk.content,
      ...sample.map((chunk) => chunk.content),
    ]
    const vectors = await embedder.embed(queries, 'query')

    goldenVectors = vectors.slice(0, GOLDEN_QUERIES.length)
    selfVector = vectors[GOLDEN_QUERIES.length]
    objectiveProbe = sample.map((chunk, index) => ({
      chunk,
      vector: vectors[GOLDEN_QUERIES.length + 1 + index],
    }))
  }, 900000)

  it('retrieves the right topic for most golden queries', async () => {
    const outcomes = await Promise.all(
      GOLDEN_QUERIES.map(async (entry, index) => {
        const hits = await store.searchSimilar(
          goldenVectors[index],
          { chunkTypes: ['question'] },
          5
        )
        return hits.some(
          (hit) => hit.metadata.topicNumber === entry.topicNumber
        )
      })
    )

    const hit = outcomes.filter(Boolean).length
    console.info(
      `[retrieval-quality] recall@5 on topic: ${hit}/${outcomes.length}`
    )

    // A floor, not a target. Topic labels come from Phase 4's keyword
    // matcher, which is itself imperfect, so this measures the pair.
    expect(hit / outcomes.length).toBeGreaterThanOrEqual(0.7)
  }, 60000)

  it('ranks a question above an unrelated one for its own text', async () => {
    // The weakest possible sanity check on a real embedder, and the one
    // that would catch a wrong taskType or a broken normalisation.
    const hits = await store.searchSimilar(
      selfVector,
      { chunkTypes: ['question'] },
      1
    )

    expect(hits[0].id).toBe(selfChunk.id)
  }, 30000)

  it('matches a question to the syllabus objective it tests', async () => {
    // Phase 4 left per-question learning objectives undone, saying the
    // mapping "needs semantic matching, which is Phase 5/6 work". This
    // is that claim, made testable: a question's own text should pull
    // back an objective from the same topic.
    expect(objectiveProbe.length).toBeGreaterThan(10)

    const outcomes = await Promise.all(
      objectiveProbe.map(async ({ chunk, vector }) => {
        const hits = await store.searchSimilar(
          vector,
          { chunkTypes: ['learningObjective'] },
          3
        )
        return hits.some(
          (hit) => hit.metadata.topicNumber === chunk.metadata.topicNumber
        )
      })
    )

    const matched = outcomes.filter(Boolean).length
    console.info(
      `[retrieval-quality] question to objective, same topic in top 3: ${matched}/${outcomes.length}`
    )

    expect(matched / outcomes.length).toBeGreaterThanOrEqual(0.5)
  }, 60000)

  it('never offers a non-exemplar chunk as something to imitate', async () => {
    // Multiple-choice questions whose options were laid out around a
    // diagram reach the store without them. They stay searchable; they
    // must not be handed to a generator as a model.
    const hits = await store.searchSimilar(
      goldenVectors[0],
      { chunkTypes: ['question'], exemplarsOnly: true },
      10
    )

    expect(hits.length).toBeGreaterThan(0)
    hits.forEach((hit) => {
      expect(hit.metadata.isExemplar).toBe(true)
    })
  }, 30000)
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
