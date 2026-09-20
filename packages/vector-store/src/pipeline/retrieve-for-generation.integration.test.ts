import { Client } from 'pg'
import { beforeAll, describe, expect, it } from 'vitest'

import { createFakeEmbedder } from '@education-ai/embeddings'

import type { VectorStore } from '../types/vector-store'
import { createPgVectorStore } from './create-pg-vector-store'
import { retrieveForGeneration } from './retrieve-for-generation'
import { runMigrations } from './run-migrations'
import { syncChunks } from './sync-chunks'
import { axisVector, embeddingChunk } from '../test-fixtures'

// Against a real database, because what is being tested is coverage
// across topics under filters — which is a query-planner behaviour, not
// a function's arithmetic.
const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'
const TEST_SCHEMA = 'retrieve_generation_test'

const databaseAvailable = await isReachable(CONNECTION_STRING)

describe.skipIf(!databaseAvailable)('retrieveForGeneration', () => {
  if (!databaseAvailable) {
    console.info('[retrieve-for-generation] skipped — no Postgres')
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
    await withClient((client) =>
      client.query(`TRUNCATE ${TEST_SCHEMA}.embedding_chunks`)
    )

    // Two topics, deliberately lopsided: topic 1 is well covered, topic
    // 6 has one question and no commentary. A real corpus looks like
    // this, and the point is that topic 6 still gets represented.
    await syncChunks({
      resourceId: 'PAPER-41',
      title: 'test paper',
      embedder: createFakeEmbedder(768),
      store,
      chunks: [
        objective('obj-1a', 1, 'describe how forces change motion'),
        objective('obj-1b', 1, "state Newton's first law of motion"),
        objective('obj-6a', 6, 'describe the structure of the Solar System'),
        question('q-forces-1', 1, 'Calculate the resultant force.', 0),
        question('q-forces-2', 1, 'Explain why the trolley accelerates.', 1),
        question('q-forces-3', 1, 'State the unit of force.', 2),
        question('q-sun-1', 6, 'Describe the Sun as a star.', 3),
        question('q-broken', 1, 'Which diagram shows the forces?', 4, {
          isExemplar: false,
        }),
        question('q-other-paper', 1, 'A different paper question.', 5, {
          sourceDocumentId: 'PAPER-11',
        }),
        insight('ins-1', 1, 'Candidates confused mass with weight.'),
      ],
    })
  }, 60000)

  it('returns context for every requested topic, however thin the corpus', async () => {
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 1 }, { topicNumber: 6 }],
    })

    expect(context.topics.map((t) => t.topicNumber)).toEqual([1, 6])
    context.topics.forEach((topic) => {
      expect(topic.exemplars.length).toBeGreaterThan(0)
    })
  })

  it('never offers a chunk whose extraction was incomplete', async () => {
    // The filter that is never optional: a question with no answers
    // teaches a generator to write questions with no answers.
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 1, exemplars: 10 }],
    })

    const ids = context.topics[0].exemplars.map((hit) => hit.id)
    expect(ids).not.toContain('q-broken')
    context.topics[0].exemplars.forEach((hit) => {
      expect(hit.metadata.isExemplar).toBe(true)
    })
  })

  it('excludes the paper being replaced', async () => {
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 1, exemplars: 10 }],
      excludeSourceDocumentIds: ['PAPER-41'],
    })

    const sources = context.topics[0].exemplars.map(
      (hit) => hit.sourceDocumentId
    )
    expect(sources).not.toContain('PAPER-41')
    expect(sources).toContain('PAPER-11')
  })

  it('keeps one copy of a question several objectives point to', async () => {
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 1, exemplars: 10 }],
    })

    const ids = context.topics[0].exemplars.map((hit) => hit.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries the syllabus objectives and examiner commentary', async () => {
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 1 }],
    })

    expect(context.topics[0].objectives.length).toBeGreaterThan(0)
    expect(context.topics[0].insights[0].content).toContain(
      'confused mass with weight'
    )
    expect(context.topics[0].topicName).toBe('Motion')
  })

  it('says what it could not find rather than returning a short list silently', async () => {
    // A generator handed one example is copying, not imitating. The
    // caller has to be able to see that and refuse.
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 6, exemplars: 5 }],
    })

    expect(context.shortfalls.join(' ')).toContain(
      'Topic 6: wanted 5 exemplars, found 1'
    )
    expect(context.shortfalls.join(' ')).toContain('no examiner commentary')
  })

  it('reports no shortfall when the corpus satisfies the request', async () => {
    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 1, exemplars: 3 }],
    })

    expect(context.shortfalls).toEqual([])
  })

  it('finds exemplars by filter alone when a topic has no objectives', async () => {
    await syncChunks({
      resourceId: 'PAPER-99',
      title: 'objectiveless',
      embedder: createFakeEmbedder(768),
      store,
      chunks: [
        question('q-lonely', 9, 'A question with no objectives.', 9, {
          sourceDocumentId: 'PAPER-99',
        }),
      ],
    })

    const context = await retrieveForGeneration({
      store,
      topics: [{ topicNumber: 9 }],
    })

    expect(context.topics[0].exemplars.map((h) => h.id)).toEqual(['q-lonely'])
    expect(context.shortfalls.join(' ')).toContain('no syllabus objectives')
  })
})

function objective(id: string, topicNumber: number, content: string) {
  return {
    ...embeddingChunk(id, axisVector(topicNumber * 10)),
    chunkType: 'learningObjective' as const,
    content,
    contentHash: `hash:${id}`,
    metadata: {
      assessmentObjectives: [],
      hasDiagram: false,
      isExemplar: true,
      topicNumber,
      topicName: topicNumber === 1 ? 'Motion' : 'Space physics',
    },
  }
}

function question(
  id: string,
  topicNumber: number,
  content: string,
  offset: number,
  overrides: { isExemplar?: boolean; sourceDocumentId?: string } = {}
) {
  return {
    ...embeddingChunk(id, axisVector(topicNumber * 10 + offset + 1)),
    content,
    contentHash: `hash:${id}`,
    sourceDocumentId: overrides.sourceDocumentId ?? 'PAPER-41',
    metadata: {
      assessmentObjectives: [],
      hasDiagram: false,
      isExemplar: overrides.isExemplar ?? true,
      topicNumber,
      topicName: topicNumber === 1 ? 'Motion' : 'Space physics',
    },
  }
}

function insight(id: string, topicNumber: number, content: string) {
  return {
    ...embeddingChunk(id, axisVector(topicNumber * 10 + 9)),
    chunkType: 'examinerInsight' as const,
    content,
    contentHash: `hash:${id}`,
    metadata: {
      assessmentObjectives: [],
      hasDiagram: false,
      isExemplar: true,
      topicNumber,
      topicName: topicNumber === 1 ? 'Motion' : 'Space physics',
    },
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
