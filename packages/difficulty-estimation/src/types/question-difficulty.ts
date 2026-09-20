// How hard a question turned out to be for the candidates who sat it.
//
// Three bands rather than a score, because the underlying evidence is
// qualitative: examiners write "most candidates answered correctly", not
// a percentage. Inventing a number from that would imply a precision the
// source does not have.
export type DifficultyBand = 'low' | 'moderate' | 'high'

// Whether a sentence describes candidates succeeding or failing. The same
// quantifier means opposite things either way: "almost all candidates
// answered correctly" is an easy question, "almost all candidates did not
// give a region with longer wavelengths" is a hard one.
export type CandidateOutcome = 'success' | 'failure'

export interface DifficultyEvidence {
  band: DifficultyBand

  // The quantifier that matched, e.g. "only stronger candidates".
  phrase: string

  outcome: CandidateOutcome

  // The sentence it came from, verbatim, so a call can be checked
  // against the source report.
  sentence: string
}

export interface QuestionDifficulty {
  questionNumber: number

  // Undefined when the examiner report said nothing measurable about
  // this question — an honest gap rather than a default of "moderate",
  // which would be indistinguishable from a real middling result.
  band?: DifficultyBand

  evidence: DifficultyEvidence[]
}

export interface QuestionDifficultyMapMetadata {
  resourceId: string

  title: string

  extractedAt: Date

  extractorVersion: string
}

export interface QuestionDifficultyMap {
  metadata: QuestionDifficultyMapMetadata

  assignments: QuestionDifficulty[]
}
