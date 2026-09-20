import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import {
  createFakeGenerator,
  createGeminiGenerator,
  generatePaper,
} from '../packages/exam-generation/src/index.js'
import type {
  GeneratedPaper,
  PaperSpec,
} from '../packages/exam-generation/src/index.js'
import {
  createFakeDiagramGenerator,
  createGeminiSvgGenerator,
  generatePaperDiagrams,
} from '../packages/diagram-generation/src/index.js'
import type { Diagram } from '../packages/diagram-generation/src/index.js'
import {
  renderMarkSchemePdf,
  renderPaperPdf,
} from '../packages/pdf-generation/src/index.js'
import {
  createPgVectorStore,
  retrieveForGeneration,
} from '../packages/vector-store/src/index.js'

// The whole backend, end to end: retrieve from the live store, generate
// a paper, check it against its specification, and check it is not a
// copy of what it was shown.
//
// Runs on the deterministic fake generator by default, so the pipeline
// is provable with no key and no cost. Pass a GEMINI_API_KEY to use the
// real model.
const SPEC: PaperSpec = {
  syllabusCode: '0625',
  title: 'IGCSE Physics 0625 — generated theory paper',
  modelledOnPaperCode: '41',
  totalMarks: 80,
  topics: [
    { topicNumber: 1, questionCount: 3 },
    { topicNumber: 2, questionCount: 2 },
    { topicNumber: 3, questionCount: 2 },
    { topicNumber: 4, questionCount: 2 },
    { topicNumber: 5, questionCount: 1 },
    { topicNumber: 6, questionCount: 1 },
  ],
  assessmentObjectiveWeights: { AO1: 50, AO2: 30, AO3: 20 },
  difficultyMix: { low: 33, moderate: 34, high: 33 },
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error('DATABASE_URL is not set — run `pnpm db:up`.')
    process.exitCode = 1
    return
  }

  const useRealModel = process.env.GENERATE_WITH_MODEL === '1'
  const apiKey = process.env.GEMINI_API_KEY

  const generator =
    useRealModel && apiKey
      ? createGeminiGenerator({
          apiKey,
          onWait: (reason, ms) =>
            console.info(`  waiting ${(ms / 1000).toFixed(0)}s — ${reason}`),
        })
      : createFakeGenerator()

  const store = createPgVectorStore({ connectionString })

  try {
    console.info('\n=== Retrieving ===')
    const retrievalStarted = Date.now()
    const context = await retrieveForGeneration({
      store,
      syllabusCode: SPEC.syllabusCode,
      topics: SPEC.topics.map((topic) => ({
        topicNumber: topic.topicNumber,
        exemplars: 5,
      })),
      excludeSourceDocumentIds: [],
    })
    console.info(
      `${context.topics.length} topics, ` +
        `${context.topics.reduce((n, t) => n + t.exemplars.length, 0)} exemplars, ` +
        `${Date.now() - retrievalStarted}ms, zero model calls`
    )

    console.info(`\n=== Generating with ${generator.model} ===`)
    const generationStarted = Date.now()
    const result = await generatePaper({ spec: SPEC, context, generator })
    console.info(
      `${result.paper.questions.length} questions, ` +
        `${result.paper.totalMarks} marks, ` +
        `${((Date.now() - generationStarted) / 1000).toFixed(1)}s`
    )

    report(result)
    const diagrams = await drawFigures(result.paper)
    await writePdfs(result.paper, diagrams)
  } finally {
    await store.close()
  }
}

function report(result: Awaited<ReturnType<typeof generatePaper>>): void {
  console.info('\n=== Validation ===')
  console.info(`valid: ${result.validation.valid}`)

  if (result.validation.violations.length === 0) {
    console.info('no violations')
  }
  result.validation.violations.forEach((violation) =>
    console.info(
      `  [${violation.severity}] ${violation.code}: ${violation.message}`
    )
  )

  console.info('\n=== Originality ===')
  console.info(
    `highest similarity to any retrieved source: ${result.originality.maxSimilarity.toFixed(3)}`
  )
  if (result.originality.findings.length === 0) {
    console.info('nothing flagged as a rewrite')
  }
  result.originality.findings.forEach((finding) =>
    console.info(
      `  Q${finding.questionNumber} resembles ${finding.sourceChunkId} at ${finding.similarity.toFixed(3)}`
    )
  )

  if (result.retrievalShortfalls.length > 0) {
    console.info('\n=== Retrieval shortfalls ===')
    result.retrievalShortfalls.forEach((line) => console.info(`  ${line}`))
  }

  console.info('\n=== Paper ===')
  result.paper.questions.forEach((question) => {
    console.info(
      `Q${question.questionNumber}  topic ${question.topicNumber}  ` +
        `${question.marks} marks  ${question.assessmentObjective}  ` +
        `${question.difficulty}`
    )
    console.info(`    ${question.text.slice(0, 92)}`)
  })
}

async function drawFigures(
  paper: GeneratedPaper
): Promise<Map<number, Diagram>> {
  const requests = paper.questions.flatMap((question) =>
    question.requiresDiagram && question.diagramBrief
      ? [
          {
            questionNumber: question.questionNumber,
            brief: question.diagramBrief,
          },
        ]
      : []
  )

  if (requests.length === 0) {
    console.info('\n=== Figures ===\nno question asked for one')
    return new Map()
  }

  const apiKey = process.env.GEMINI_API_KEY
  const generator =
    process.env.GENERATE_WITH_MODEL === '1' && apiKey
      ? createGeminiSvgGenerator({
          apiKey,
          onWait: (reason, ms) =>
            console.info(`  waiting ${(ms / 1000).toFixed(0)}s — ${reason}`),
        })
      : createFakeDiagramGenerator()

  console.info(`\n=== Figures, with ${generator.model} ===`)

  const result = await generatePaperDiagrams(requests, generator)

  console.info(`drew ${result.byQuestion.size} of ${requests.length} requested`)
  result.failures.forEach((failure) =>
    console.info(`  Q${failure.questionNumber} failed: ${failure.reason}`)
  )

  return result.byQuestion
}

async function writePdfs(
  paper: GeneratedPaper,
  diagrams: Map<number, Diagram>
): Promise<void> {
  const directory = path.join(
    resolveWorkspaceRoot(process.cwd()),
    'output',
    'papers'
  )
  await mkdir(directory, { recursive: true })

  const stem = `${paper.syllabusCode}-generated`
  const paperPath = path.join(directory, `${stem}.pdf`)
  const markSchemePath = path.join(directory, `${stem}-mark-scheme.pdf`)

  await writeFile(
    paperPath,
    await renderPaperPdf(paper, {
      duration: '1 hour 15 minutes',
      diagrams,
    })
  )
  await writeFile(markSchemePath, await renderMarkSchemePdf(paper))

  console.info('\n=== PDFs ===')
  console.info(`  ${path.relative(process.cwd(), paperPath)}`)
  console.info(`  ${path.relative(process.cwd(), markSchemePath)}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
