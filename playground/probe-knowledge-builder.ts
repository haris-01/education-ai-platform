import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { assembleKnowledgeDocument } from '../packages/knowledge-builder/src/index.js'
import type { AssembleKnowledgeDocumentInput } from '../packages/knowledge-builder/src/index.js'

const SESSION_ROOT = 'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj'
const SYLLABUS_PDF =
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'
const EXAMINER_REPORT_PDF = `${SESSION_ROOT}/570003-june-2024-examiner-report.pdf`

const PAPERS: Array<{
  label: string
  input: Omit<
    AssembleKnowledgeDocumentInput,
    'syllabusPdfPath' | 'examinerReportPdfPath'
  >
}> = [
  {
    label: 'paper 11 (MCQ)',
    input: {
      questionPaperPdfPath: `${SESSION_ROOT}/11/570010-june-2024-question-paper-11.pdf`,
      markSchemePdfPath: `${SESSION_ROOT}/11/570004-june-2024-mark-scheme-paper-11.pdf`,
      markSchemeType: 'mcq',
      examinerReportPaperCode: '0625/11',
    },
  },
  {
    label: 'paper 41 (theory)',
    input: {
      questionPaperPdfPath: `${SESSION_ROOT}/41/671385-june-2024-question-paper-41.pdf`,
      markSchemePdfPath: `${SESSION_ROOT}/41/671373-june-2024-mark-scheme-paper-41.pdf`,
      markSchemeType: 'theory',
      examinerReportPaperCode: '0625/41',
    },
  },
]

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const resolve = (p: string) => path.join(root, p)

  for (const { label, input } of PAPERS) {
    const knowledge = await assembleKnowledgeDocument({
      ...input,
      questionPaperPdfPath: resolve(input.questionPaperPdfPath),
      markSchemePdfPath: resolve(input.markSchemePdfPath),
      syllabusPdfPath: resolve(SYLLABUS_PDF),
      examinerReportPdfPath: resolve(EXAMINER_REPORT_PDF),
    })

    const withAnswer = knowledge.questions.filter((q) => q.correctAnswer).length
    const withMarkingPoints = knowledge.questions.filter(
      (q) => q.markingPoints && q.markingPoints.length > 0
    ).length
    const withTopic = knowledge.questions.filter((q) => q.topicNumber).length
    const withCommentary = knowledge.questions.filter(
      (q) => q.examinerCommentary
    ).length

    console.info(`\n=== ${label}: ${knowledge.questions.length} questions ===`)
    console.info(
      `with answer: ${withAnswer}  with marking points: ${withMarkingPoints}  with topic: ${withTopic}  with commentary: ${withCommentary}`
    )
    knowledge.questions.forEach((q) => {
      console.info(
        `Q${q.questionNumber}: [${q.marks ?? '?'}m] ${q.topicName ?? 'UNCLASSIFIED'} — answer=${q.correctAnswer ?? '-'} — points=${q.markingPoints?.length ?? 0} — commentary=${q.examinerCommentary ? 'yes' : 'no'}`
      )
    })
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
