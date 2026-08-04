import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveWorkspaceRoot } from '@education-ai/shared'

import { assembleKnowledgeDocument } from './pipeline/assemble-knowledge-document'

// Real Cambridge 0625 June 2024 session — the one session in the Phase 1
// dataset with question paper + mark scheme + examiner report coverage
// for both an MCQ paper (11) and a theory paper (41), so together these
// two cases exercise every enrichment `assembleKnowledgeDocument` wires up.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const SESSION_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj'
)
const SYLLABUS_PDF = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'
)
const EXAMINER_REPORT_PDF = path.join(
  SESSION_ROOT,
  '570003-june-2024-examiner-report.pdf'
)
const PAPER_11 = {
  questionPaperPdfPath: path.join(
    SESSION_ROOT,
    '11/570010-june-2024-question-paper-11.pdf'
  ),
  markSchemePdfPath: path.join(
    SESSION_ROOT,
    '11/570004-june-2024-mark-scheme-paper-11.pdf'
  ),
}
const PAPER_41 = {
  questionPaperPdfPath: path.join(
    SESSION_ROOT,
    '41/671385-june-2024-question-paper-41.pdf'
  ),
  markSchemePdfPath: path.join(
    SESSION_ROOT,
    '41/671373-june-2024-mark-scheme-paper-41.pdf'
  ),
}

const datasetAvailable = [
  PAPER_11.questionPaperPdfPath,
  PAPER_11.markSchemePdfPath,
  PAPER_41.questionPaperPdfPath,
  PAPER_41.markSchemePdfPath,
  EXAMINER_REPORT_PDF,
  SYLLABUS_PDF,
].every(existsSync)

describe.skipIf(!datasetAvailable)('knowledge builder corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found under ${WORKSPACE_ROOT}`
    )
  }

  it('assembles paper 11 (MCQ) with every enrichment populated', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_11,
      markSchemeType: 'mcq',
      syllabusPdfPath: SYLLABUS_PDF,
      examinerReportPdfPath: EXAMINER_REPORT_PDF,
      examinerReportPaperCode: '0625/11',
    })

    expect(knowledge.questions).toHaveLength(40)
    expect(knowledge.topics.length).toBeGreaterThan(0)

    const withAnswer = knowledge.questions.filter(
      (q) => q.correctAnswer !== undefined
    )
    const withTopic = knowledge.questions.filter(
      (q) => q.topicNumber !== undefined
    )
    // Every MCQ has an answer in the mark scheme — this must be ~all of
    // them. Topic classification is a best-effort keyword match (see
    // topic-mapping), so only a floor is asserted there.
    expect(
      withAnswer.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.9)
    expect(
      withTopic.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.6)
  }, 30000)

  it('assembles paper 41 (theory) with marking points populated', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
      examinerReportPdfPath: EXAMINER_REPORT_PDF,
      examinerReportPaperCode: '0625/41',
    })

    // Both papers run to at least question 8; a low count would mean the
    // table detector missed most of the pages.
    expect(knowledge.questions.length).toBeGreaterThanOrEqual(8)

    const withMarkingPoints = knowledge.questions.filter(
      (q) => q.markingPoints !== undefined && q.markingPoints.length > 0
    )
    // Theory questions are matched to the mark scheme by their leading
    // question number, so this should cover nearly every question — a
    // low rate would mean the sub-part grouping regressed.
    expect(
      withMarkingPoints.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.8)

    knowledge.questions.forEach((q) => {
      expect(q.correctAnswer).toBeUndefined()
    })
  }, 30000)
})
