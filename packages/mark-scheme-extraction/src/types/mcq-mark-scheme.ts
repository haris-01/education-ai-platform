// The answer key for one multiple-choice question, e.g.
// { questionNumber: 4, answer: "B", marks: 1 }. Named `Mcq*` rather than a
// generic `MarkScheme*` on purpose — theory-paper mark schemes use a
// completely different (much harder) table layout and aren't covered by
// this extractor. See docs/learning-notes for why.
export interface McqAnswer {
  questionNumber: number

  // Usually a single letter ("A"-"D"). Can also be "Discounted" — Cambridge
  // occasionally voids a question after the exam if it's found to be
  // flawed, and the mark scheme records that instead of an answer letter.
  answer: string

  marks: number
}

export interface McqMarkSchemeMetadata {
  resourceId: string

  title: string

  pageCount: number

  extractedAt: Date

  extractorVersion: string
}

export interface McqMarkScheme {
  metadata: McqMarkSchemeMetadata

  answers: McqAnswer[]
}
