// One row of a theory mark scheme's Answer column, verbatim.
export interface MarkPoint {
  text: string

  // The Marks-column code for this row (e.g. "A3", "C1", "B1") —
  // Cambridge's marking-point codes. Left as the raw code rather than
  // parsed into a number: whether several mark points under one question
  // are additive or alternative ("OR") routes to the same marks isn't
  // decidable from the table alone, so no total is computed. Undefined
  // when the row's Marks cell was blank (a continuation row with no mark
  // of its own).
  markCode?: string
}

export interface QuestionMarkScheme {
  // e.g. "2(a)(i)" — the exam's own sub-part reference string, not
  // decomposed into number/part/subPart, since mark schemes sometimes key
  // a row to a whole question ("2(a)") that spans several question-paper
  // sub-parts.
  questionNumber: string

  markPoints: MarkPoint[]
}

export interface TheoryMarkSchemeMetadata {
  resourceId: string

  title: string

  pageCount: number

  extractedAt: Date

  extractorVersion: string
}

export interface TheoryMarkScheme {
  metadata: TheoryMarkSchemeMetadata

  questions: QuestionMarkScheme[]
}
