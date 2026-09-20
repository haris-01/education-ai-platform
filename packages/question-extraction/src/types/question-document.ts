import type { PaperIdentity } from '@education-ai/shared'

import type { Question } from './question'

// Parser metadata for this stage, mirroring `DocumentMetadata` in
// document-ai — kept separate rather than reused because it describes the
// question-extraction step, not the PDF-parsing step.
export interface QuestionDocumentMetadata {
  resourceId: string

  title: string

  pageCount: number

  // Which paper this is, read off the document's own printed code.
  // Undefined when the document doesn't print one, or prints codes that
  // disagree — see `findPaperIdentity`.
  paper?: PaperIdentity

  extractedAt: Date

  extractorVersion: string
}

export interface QuestionDocument {
  metadata: QuestionDocumentMetadata

  questions: Question[]
}
