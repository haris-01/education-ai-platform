import type { ParsedDocument } from '@education-ai/document-ai'

import type { QuestionDocument } from '../types/question-document'
import { assembleQuestions } from './assemble-questions'
import { classifyLines } from './classify-lines'
import { reconstructLines } from './reconstruct-lines'

const EXTRACTOR_VERSION = '0.1.0'

/**
 * Turns a `ParsedDocument` (Phase 2's output) into a `QuestionDocument`:
 * questions with numbering, sub-parts, and mark counts. Consumes
 * `ParsedDocument`, never the source PDF — Phase 4 onward will consume
 * `QuestionDocument` the same way.
 */
export function buildQuestionDocument(parsed: ParsedDocument): QuestionDocument {
  const lines = parsed.pages.flatMap((page) => reconstructLines(page))
  const classifiedLines = classifyLines(lines)

  return {
    metadata: {
      resourceId: parsed.metadata.resourceId,
      title: parsed.metadata.title,
      pageCount: parsed.metadata.pageCount,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    questions: assembleQuestions(classifiedLines),
  }
}
