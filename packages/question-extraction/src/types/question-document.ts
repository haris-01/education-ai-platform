import type { Question } from './question'

// Parser metadata for this stage, mirroring `DocumentMetadata` in
// document-ai — kept separate rather than reused because it describes the
// question-extraction step, not the PDF-parsing step.
export interface QuestionDocumentMetadata {
  resourceId: string

  title: string

  pageCount: number

  extractedAt: Date

  extractorVersion: string
}

export interface QuestionDocument {
  metadata: QuestionDocumentMetadata

  questions: Question[]
}
