import path from 'node:path'

import { createGeminiEmbedder } from '../packages/embeddings/src/index.js'
import { assembleKnowledgeDocument } from '../packages/knowledge-builder/src/index.js'
import type { KnowledgeDocument } from '../packages/knowledge-builder/src/index.js'
import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { CORPUS_PAPERS, SYLLABUS_PDF } from './probe-corpus-papers.js'

// Phase 4 left the multiple-choice assessment-objective gap open, saying
// embeddings should close it. There is no per-question ground truth for
// multiple-choice questions — that absence is the gap. But theory
// questions ARE labelled, by the syllabus's own command-word glossary,
// at 92-100% coverage.
//
// So this measures the transfer: if assigning an AO by nearest syllabus
// description agrees with the command-word label where a label exists,
// the method is credible where one does not. If it does not agree, then
// embeddings alone are not the answer and Phase 4's expectation was
// wrong. Either result is worth having.
async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set.')
    process.exitCode = 1
    return
  }

  const theoryPapers = CORPUS_PAPERS.filter((paper) =>
    ['0625/31', '0625/41'].includes(paper.paperCode)
  )

  const documents = await Promise.all(
    theoryPapers.map((paper) =>
      assembleKnowledgeDocument({
        questionPaperPdfPath: path.join(root, paper.questionPaper),
        markSchemePdfPath: path.join(root, paper.markScheme),
        markSchemeType: paper.markSchemeType,
        syllabusPdfPath: path.join(root, SYLLABUS_PDF),
      })
    )
  )

  const embedder = createGeminiEmbedder({
    apiKey,
    onWait: (reason, ms) =>
      console.info(`  waiting ${(ms / 1000).toFixed(0)}s — ${reason}`),
  })

  // Papers 1-4 carry no AO3, so the choice is between AO1 and AO2 —
  // exactly the distinction command words cannot make on a descriptive
  // multiple-choice question.
  const objectives = describeObjectives(documents[0]).filter((objective) =>
    ['AO1', 'AO2'].includes(objective.code)
  )

  console.info('\n=== Assessment objectives, as the syllabus states them ===')
  objectives.forEach((objective) => {
    console.info(`${objective.code}: ${objective.text.slice(0, 110)}...`)
  })

  const labelled = documents.flatMap((document) =>
    document.questions.flatMap((question) => {
      const label = question.primaryAssessmentObjective
      if (!label || !['AO1', 'AO2'].includes(label)) {
        return []
      }
      return [
        {
          paper: document.metadata.paper?.code ?? '?',
          questionNumber: question.questionNumber,
          label,
          text: questionText(question),
        },
      ]
    })
  )

  console.info(`\nlabelled theory questions: ${labelled.length}`)

  if (labelled.length === 0) {
    console.error('No command-word labels found — nothing to compare against.')
    process.exitCode = 1
    return
  }

  const objectiveVectors = await embedder.embed(
    objectives.map((objective) => objective.text),
    'document'
  )
  const questionVectors = await embedder.embed(
    labelled.map((entry) => entry.text),
    'query'
  )

  console.info('\n=== Nearest objective vs command-word label ===')

  const outcomes = labelled.map((entry, index) => {
    const scored = objectives.map((objective, objectiveIndex) => ({
      code: objective.code,
      similarity: dot(questionVectors[index], objectiveVectors[objectiveIndex]),
    }))
    const best = scored.reduce((a, b) => (b.similarity > a.similarity ? b : a))
    const margin = Math.abs(scored[0].similarity - scored[1].similarity) || 0

    return { ...entry, predicted: best.code, margin }
  })

  outcomes.forEach((outcome) => {
    const mark = outcome.predicted === outcome.label ? 'agree' : 'DIFFER'
    console.info(
      `${mark}  ${outcome.paper} Q${outcome.questionNumber}  ` +
        `label ${outcome.label}  predicted ${outcome.predicted}  ` +
        `margin ${outcome.margin.toFixed(4)}`
    )
  })

  const agreed = outcomes.filter((o) => o.predicted === o.label).length
  const predictedAo1 = outcomes.filter((o) => o.predicted === 'AO1').length
  const labelledAo1 = outcomes.filter((o) => o.label === 'AO1').length

  console.info(
    `\nagreement: ${agreed}/${outcomes.length} (${Math.round((agreed / outcomes.length) * 100)}%)`
  )
  console.info(
    `predicted AO1: ${predictedAo1}/${outcomes.length}, ` +
      `labelled AO1: ${labelledAo1}/${outcomes.length}`
  )
  console.info(
    `mean margin between the two objectives: ` +
      `${(outcomes.reduce((s, o) => s + o.margin, 0) / outcomes.length).toFixed(4)}`
  )
}

function describeObjectives(
  document: KnowledgeDocument
): { code: string; text: string }[] {
  return document.assessmentObjectives.map((objective) => ({
    code: objective.code,
    text: `${objective.name}. ${objective.description.join(' ')}`,
  }))
}

function questionText(
  question: KnowledgeDocument['questions'][number]
): string {
  return [
    question.text,
    ...question.parts.map((part) => part.text),
    ...question.options.map((option) => option.text),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
