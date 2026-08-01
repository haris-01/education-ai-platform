export interface QuestionComment {
  questionNumber: number

  // The full commentary for this question, joined into one block — any
  // internal sub-part structure ("(a)", "(b) (i)", ...) is left as plain
  // text, not parsed further. A deliberately shallower extraction than
  // question-extraction's nested Question tree.
  comment: string
}

export interface PaperExaminerReport {
  // "0625/31"
  paperCode: string

  generalComments: string

  questionComments: QuestionComment[]
}

export interface ExaminerReportMetadata {
  resourceId: string

  title: string

  pageCount: number

  extractedAt: Date

  extractorVersion: string
}

export interface ExaminerReport {
  metadata: ExaminerReportMetadata

  // One entry per paper variant covered by this report — a single
  // examiner report PDF typically covers every paper in a session (e.g.
  // 0625/11, 0625/12, 0625/13, 0625/21, ...), not just one.
  papers: PaperExaminerReport[]
}
