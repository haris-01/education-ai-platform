import {
  createPgVectorStore,
  retrieveForGeneration,
} from '../packages/vector-store/src/index.js'

// Retrieval against the live store, with no embedding calls at all —
// exemplars are found from the stored vectors of the syllabus
// objectives themselves. Run `pnpm probe:embeddings` first to populate.
const TOPICS = [1, 2, 3, 4, 5, 6]

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('DATABASE_URL is not set — run `pnpm db:up` and copy .env.')
    process.exitCode = 1
    return
  }

  const store = createPgVectorStore({ connectionString })

  try {
    const startedAt = Date.now()
    const context = await retrieveForGeneration({
      store,
      syllabusCode: '0625',
      topics: TOPICS.map((topicNumber) => ({ topicNumber, exemplars: 5 })),
    })

    console.info(
      `\n=== Retrieved context for ${context.topics.length} topics ` +
        `in ${Date.now() - startedAt}ms, zero model calls ===`
    )

    context.topics.forEach((topic) => {
      console.info(
        `\nTopic ${topic.topicNumber}: ${topic.topicName ?? '(unnamed)'}` +
          `  — ${topic.objectives.length} objectives, ` +
          `${topic.exemplars.length} exemplars, ${topic.insights.length} insights`
      )
      topic.exemplars.slice(0, 3).forEach((hit) => {
        console.info(
          `   ${(hit.distance ?? 0).toFixed(3)}  ` +
            `${hit.metadata.paperCode ?? '-'} Q${hit.metadata.questionNumber ?? '-'}  ` +
            `${firstLine(hit.content)}`
        )
      })
    })

    const exemplars = context.topics.flatMap((topic) => topic.exemplars)
    console.info(
      `\ntotal exemplars: ${exemplars.length}, ` +
        `unique: ${new Set(exemplars.map((hit) => hit.id)).size}`
    )
    console.info(
      `all exemplars fit to imitate: ${exemplars.every((hit) => hit.metadata.isExemplar)}`
    )

    if (context.shortfalls.length === 0) {
      console.info('\nno shortfalls')
      return
    }

    console.info('\nshortfalls:')
    context.shortfalls.forEach((line) => console.info(`  ${line}`))
  } finally {
    await store.close()
  }
}

function firstLine(content: string): string {
  const body = content.split('\n\n').slice(1).join(' ').replace(/\s+/g, ' ')
  return body.slice(0, 58)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
