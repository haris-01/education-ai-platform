import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { buildExaminerReport } from '@education-ai/examiner-report-extraction'
import {
  buildMcqMarkScheme,
  buildTheoryMarkScheme,
} from '@education-ai/mark-scheme-extraction'
import { buildQuestionDocument } from '@education-ai/question-extraction'
import { resolveWorkspaceRoot } from '@education-ai/shared'
import { buildSyllabusOverview } from '@education-ai/syllabus-extraction'

import { buildKnowledgeDocument } from './pipeline/build-knowledge-document'

// Real Cambridge 0625 June 2024 paper 11 (MCQ) — the one paper in the
// Phase 1 dataset with a question paper, a mark scheme, and examiner
// report coverage all from the same session, so this is the only corpus
// case that can exercise every enrichment at once.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const PAPER_11 = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/11/570010-june-2024-question-paper-11.pdf'
)
const MARK_SCHEME_11 = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/11/570004-june-2024-mark-scheme-paper-11.pdf'
)
const EXAMINER_REPORT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/570003-june-2024-examiner-report.pdf'
)
const SYLLABUS_PDF = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'
)
const PAPER_41 = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/41/671385-june-2024-question-paper-41.pdf'
)
const MARK_SCHEME_41 = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/41/671373-june-2024-mark-scheme-paper-41.pdf'
)

const datasetAvailable = [
  PAPER_11,
  MARK_SCHEME_11,
  EXAMINER_REPORT,
  SYLLABUS_PDF,
  PAPER_41,
  MARK_SCHEME_41,
].every(existsSync)

describe.skipIf(!datasetAvailable)('knowledge builder corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found under ${WORKSPACE_ROOT}`
    )
  }

  it('joins paper 11 into a knowledge document with every enrichment populated', async () => {
    const [questionParsed, markSchemeParsed, examinerParsed, syllabusParsed] =
      await Promise.all([
        parseNativePdf(PAPER_11),
        parseNativePdf(MARK_SCHEME_11),
        parseNativePdf(EXAMINER_REPORT),
        parseNativePdf(SYLLABUS_PDF),
      ])

    const questionDocument = buildQuestionDocument(questionParsed)
    const mcqMarkScheme = buildMcqMarkScheme(markSchemeParsed)
    const examinerReport = buildExaminerReport(examinerParsed)
    const syllabus = buildSyllabusOverview(syllabusParsed)
    const paper11Report = examinerReport.papers.find(
      (p) => p.paperCode === '0625/11'
    )
    expect(paper11Report).toBeDefined()

    const knowledge = buildKnowledgeDocument({
      questionDocument,
      syllabus,
      mcqMarkScheme,
      examinerReport: paper11Report,
    })

    expect(knowledge.questions).toHaveLength(questionDocument.questions.length)
    expect(knowledge.topics).toEqual(syllabus.topics)

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

  it('joins paper 41 (theory) into a knowledge document with marking points populated', async () => {
    const [questionParsed, markSchemeParsed, examinerParsed, syllabusParsed] =
      await Promise.all([
        parseNativePdf(PAPER_41),
        parseNativePdf(MARK_SCHEME_41),
        parseNativePdf(EXAMINER_REPORT),
        parseNativePdf(SYLLABUS_PDF),
      ])

    const questionDocument = buildQuestionDocument(questionParsed)
    const theoryMarkScheme = buildTheoryMarkScheme(markSchemeParsed)
    const examinerReport = buildExaminerReport(examinerParsed)
    const syllabus = buildSyllabusOverview(syllabusParsed)
    const paper41Report = examinerReport.papers.find(
      (p) => p.paperCode === '0625/41'
    )
    expect(paper41Report).toBeDefined()

    const knowledge = buildKnowledgeDocument({
      questionDocument,
      syllabus,
      theoryMarkScheme,
      examinerReport: paper41Report,
    })

    expect(knowledge.questions).toHaveLength(questionDocument.questions.length)

    const withMarkingPoints = knowledge.questions.filter(
      (q) => q.markingPoints !== undefined && q.markingPoints.length > 0
    )
    // Theory questions are matched to the mark scheme by their leading
    // question number, so this should cover nearly every question — a low
    // rate would mean the sub-part grouping regressed.
    expect(
      withMarkingPoints.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.8)

    knowledge.questions.forEach((q) => {
      expect(q.correctAnswer).toBeUndefined()
    })
  }, 30000)
})
