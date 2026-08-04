import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildExaminerReport } from '../packages/examiner-report-extraction/src/index.js'
import { buildKnowledgeDocument } from '../packages/knowledge-builder/src/index.js'
import { buildMcqMarkScheme } from '../packages/mark-scheme-extraction/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'
import { buildSyllabusOverview } from '../packages/syllabus-extraction/src/index.js'

const PAPER_11 =
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/11/570010-june-2024-question-paper-11.pdf'
const MARK_SCHEME_11 =
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/11/570004-june-2024-mark-scheme-paper-11.pdf'
const EXAMINER_REPORT =
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/570003-june-2024-examiner-report.pdf'
const SYLLABUS_PDF =
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const resolve = (p: string) => path.join(root, p)

  const [questionParsed, markSchemeParsed, examinerParsed, syllabusParsed] =
    await Promise.all([
      parseNativePdf(resolve(PAPER_11)),
      parseNativePdf(resolve(MARK_SCHEME_11)),
      parseNativePdf(resolve(EXAMINER_REPORT)),
      parseNativePdf(resolve(SYLLABUS_PDF)),
    ])

  const questionDocument = buildQuestionDocument(questionParsed)
  const mcqMarkScheme = buildMcqMarkScheme(markSchemeParsed)
  const examinerReport = buildExaminerReport(examinerParsed)
  const syllabus = buildSyllabusOverview(syllabusParsed)
  const examinerReport11 = examinerReport.papers.find(
    (p) => p.paperCode === '0625/11'
  )

  const knowledge = buildKnowledgeDocument({
    questionDocument,
    syllabus,
    mcqMarkScheme,
    examinerReport: examinerReport11,
  })

  const withAnswer = knowledge.questions.filter((q) => q.correctAnswer).length
  const withTopic = knowledge.questions.filter((q) => q.topicNumber).length
  const withCommentary = knowledge.questions.filter(
    (q) => q.examinerCommentary
  ).length

  console.info(`questions: ${knowledge.questions.length}`)
  console.info(`with correct answer: ${withAnswer}`)
  console.info(`with topic: ${withTopic}`)
  console.info(`with examiner commentary: ${withCommentary}`)
  knowledge.questions.forEach((q) => {
    console.info(
      `Q${q.questionNumber}: [${q.marks ?? '?'}m] ${q.topicName ?? 'UNCLASSIFIED'} — answer=${q.correctAnswer ?? '-'} — commentary=${q.examinerCommentary ? 'yes' : 'no'}`
    )
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
