import { trigramSimilarity } from '../packages/exam-generation/src/index.js'
import { createPgVectorStore } from '../packages/vector-store/src/index.js'

// Where should the originality threshold sit?
//
// Guessing is how the first version got 0.5, which let a
// numbers-swapped copy through at 0.41. The corpus can answer instead:
// every pair of *real, distinct* Cambridge questions is by definition
// original, so the top of that distribution is the floor a threshold
// must clear. Anything at or below it would flag the genuine article.
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('DATABASE_URL is not set — run `pnpm db:up`.')
    process.exitCode = 1
    return
  }

  const store = createPgVectorStore({ connectionString })

  try {
    const questions = await store.listChunks({ chunkTypes: ['question'] }, 1000)
    console.info(
      `\n=== Pairwise similarity across ${questions.length} real questions ===`
    )

    const scores = questions
      .flatMap((left, i) =>
        questions.slice(i + 1).map((right) => ({
          score: trigramSimilarity(body(left.content), body(right.content)),
          left,
          right,
        }))
      )
      .sort((a, b) => b.score - a.score)

    const values = scores.map((entry) => entry.score)
    console.info(`pairs compared: ${values.length.toLocaleString()}`)
    console.info(`mean:     ${mean(values).toFixed(4)}`)
    ;[50, 90, 99, 99.9].forEach((p) =>
      console.info(
        `p${p.toString().padEnd(5)} ${percentile(values, p).toFixed(4)}`
      )
    )
    console.info(`max:      ${values[0].toFixed(4)}`)

    console.info('\nthe five most similar real pairs — these are all original:')
    scores.slice(0, 5).forEach((entry) => {
      console.info(
        `  ${entry.score.toFixed(3)}  ` +
          `${entry.left.metadata.paperCode}Q${entry.left.metadata.questionNumber} vs ` +
          `${entry.right.metadata.paperCode}Q${entry.right.metadata.questionNumber}`
      )
      console.info(`         ${body(entry.left.content).slice(0, 78)}`)
      console.info(`         ${body(entry.right.content).slice(0, 78)}`)
    })
  } finally {
    await store.close()
  }
}

function body(content: string): string {
  return content.split('\n\n').slice(1).join(' ')
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// `values` arrives sorted descending.
function percentile(values: number[], p: number): number {
  const index = Math.floor(((100 - p) / 100) * values.length)
  return values[Math.min(index, values.length - 1)]
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
