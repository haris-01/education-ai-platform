import path from 'node:path'

import {
  chunkExaminerInsights,
  chunkLearningObjectives,
  chunkQuestions,
  createGeminiEmbedder,
} from '../packages/embeddings/src/index.js'
import type { Chunk, Embedder } from '../packages/embeddings/src/index.js'
import { assembleKnowledgeDocument } from '../packages/knowledge-builder/src/index.js'
import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import {
  createPgVectorStore,
  runMigrations,
  syncChunks,
} from '../packages/vector-store/src/index.js'
import {
  CORPUS_PAPERS,
  EXAMINER_REPORT_PDF,
  SYLLABUS_PDF,
  SYLLABUS_RESOURCE_ID,
} from './probe-corpus-papers.js'

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const apiKey = process.env.GEMINI_API_KEY

  console.info('\n=== Chunking the June 2024 session ===')

  const chunksByPaper = await Promise.all(
    CORPUS_PAPERS.map(async (paper) => {
      const knowledge = await assembleKnowledgeDocument({
        questionPaperPdfPath: path.join(root, paper.questionPaper),
        markSchemePdfPath: path.join(root, paper.markScheme),
        markSchemeType: paper.markSchemeType,
        syllabusPdfPath: path.join(root, SYLLABUS_PDF),
        examinerReportPdfPath: path.join(root, EXAMINER_REPORT_PDF),
        examinerReportPaperCode: paper.paperCode,
      })

      return {
        paper,
        knowledge,
        questions: chunkQuestions(knowledge),
        insights: chunkExaminerInsights(knowledge),
      }
    })
  )

  // The syllabus is chunked once, not once per paper — the objectives
  // belong to it, not to whichever paper it was read alongside.
  const objectives = chunkLearningObjectives(
    chunksByPaper[0].knowledge,
    SYLLABUS_RESOURCE_ID
  )

  chunksByPaper.forEach(({ paper, knowledge, questions, insights }) => {
    console.info(
      `${paper.paperCode}: ${knowledge.questions.length} questions, ` +
        `${questions.length} question chunks, ${insights.length} insight chunks, ` +
        `mean ${meanLength(questions)} chars`
    )
  })

  const allChunks = [
    ...chunksByPaper.flatMap((entry) => entry.questions),
    ...chunksByPaper.flatMap((entry) => entry.insights),
    ...objectives,
  ]

  console.info(`\nlearning objective chunks: ${objectives.length}`)
  console.info(`total chunks: ${allChunks.length}`)
  console.info(`mean chunk length: ${meanLength(allChunks)} chars`)
  console.info(
    `estimated tokens: ~${estimateTokens(allChunks).toLocaleString()}`
  )

  const withTopic = allChunks.filter(
    (chunk) => chunk.metadata.topicNumber !== undefined
  )
  console.info(
    `chunks carrying a topic: ${withTopic.length}/${allChunks.length} ` +
      `(${percent(withTopic.length, allChunks.length)})`
  )

  if (!apiKey) {
    console.info(
      '\nGEMINI_API_KEY is not set — stopping before embedding.\n' +
        'Chunking is fully measured above; retrieval quality is not, and\n' +
        'the fake embedder cannot stand in for it. Set the key in .env to\n' +
        'run the golden queries.'
    )
    return
  }

  await embedAndRetrieve(allChunks, apiKey)
}

async function embedAndRetrieve(
  chunks: Chunk[],
  apiKey: string
): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('DATABASE_URL is not set — run `pnpm db:up` and copy .env.')
    process.exitCode = 1
    return
  }

  const embedder: Embedder = createGeminiEmbedder({
    apiKey,
    onWait: (reason, ms) =>
      console.info(`  waiting ${(ms / 1000).toFixed(0)}s — ${reason}`),
  })

  console.info(`\n=== Embedding with ${embedder.model} ===`)

  await runMigrations({ connectionString })
  const store = createPgVectorStore({ connectionString })

  try {
    const startedAt = Date.now()

    const report = await syncChunks({
      resourceId: 'CAM-0625-MJ-2024',
      title: 'Cambridge IGCSE Physics 0625, June 2024',
      chunks,
      embedder,
      store,
    })

    console.info(
      `embedded ${report.embedded}, refreshed ${report.refreshed}, ` +
        `removed ${report.removed}, of ${report.total} chunks ` +
        `in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    )

    console.info(
      '\nRetrieval quality is measured by the opt-in suite, not here:\n' +
        '  pnpm test:retrieval'
    )
  } finally {
    await store.close()
  }
}

function meanLength(chunks: Chunk[]): number {
  if (chunks.length === 0) {
    return 0
  }

  return Math.round(
    chunks.reduce((total, chunk) => total + chunk.content.length, 0) /
      chunks.length
  )
}

// Rough, and labelled as such: ~4 characters per token is close enough
// for deciding whether a corpus fits in a free tier.
function estimateTokens(chunks: Chunk[]): number {
  return Math.round(
    chunks.reduce((total, chunk) => total + chunk.content.length, 0) / 4
  )
}

function percent(part: number, whole: number): string {
  if (whole === 0) {
    return '0%'
  }

  return `${Math.round((part / whole) * 100)}%`
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
