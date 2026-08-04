import { parseNativePdf } from '@education-ai/document-ai'
import { buildExaminerReport } from '@education-ai/examiner-report-extraction'
import {
  buildMcqMarkScheme,
  buildTheoryMarkScheme,
} from '@education-ai/mark-scheme-extraction'
import { buildQuestionDocument } from '@education-ai/question-extraction'
import { buildSyllabusOverview } from '@education-ai/syllabus-extraction'

import type { KnowledgeDocument } from '../types/knowledge-document'
import { buildKnowledgeDocument } from './build-knowledge-document'

export interface AssembleKnowledgeDocumentInput {
  questionPaperPdfPath: string

  markSchemePdfPath: string

  markSchemeType: 'mcq' | 'theory'

  syllabusPdfPath: string

  // Both required together to attach commentary — the report PDF covers
  // many papers, so pulling out the right section needs its code (e.g.
  // "0625/41"). Omit both when no examiner report is available for this
  // paper yet; supplying one without the other yields no commentary
  // rather than an error, same as a paper code the report doesn't cover.
  examinerReportPdfPath?: string

  examinerReportPaperCode?: string
}

/**
 * Parses and joins every Phase 4 source document for one question paper
 * off disk into a single `KnowledgeDocument`. `buildKnowledgeDocument`
 * itself takes already-parsed structured input and does no I/O — this is
 * the one place the "parse four PDFs, pick the right extractor, find the
 * right examiner-report section" orchestration should live, instead of
 * being copy-pasted into every probe script and corpus test that needs a
 * real, fully-joined paper (which is exactly how it existed before this).
 */
export async function assembleKnowledgeDocument(
  input: AssembleKnowledgeDocumentInput
): Promise<KnowledgeDocument> {
  const [questionParsed, markSchemeParsed, syllabusParsed, examinerParsed] =
    await Promise.all([
      parseNativePdf(input.questionPaperPdfPath),
      parseNativePdf(input.markSchemePdfPath),
      parseNativePdf(input.syllabusPdfPath),
      input.examinerReportPdfPath
        ? parseNativePdf(input.examinerReportPdfPath)
        : undefined,
    ])

  const questionDocument = buildQuestionDocument(questionParsed)
  const syllabus = buildSyllabusOverview(syllabusParsed)
  const examinerReport = examinerParsed
    ? buildExaminerReport(examinerParsed).papers.find(
        (paper) => paper.paperCode === input.examinerReportPaperCode
      )
    : undefined

  if (input.markSchemeType === 'mcq') {
    return buildKnowledgeDocument({
      questionDocument,
      syllabus,
      mcqMarkScheme: buildMcqMarkScheme(markSchemeParsed),
      examinerReport,
    })
  }

  return buildKnowledgeDocument({
    questionDocument,
    syllabus,
    theoryMarkScheme: buildTheoryMarkScheme(markSchemeParsed),
    examinerReport,
  })
}
