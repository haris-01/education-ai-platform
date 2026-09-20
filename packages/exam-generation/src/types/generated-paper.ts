import type { DifficultyBand } from '@education-ai/difficulty-estimation'

export interface GeneratedMarkPoint {
  // What earns the mark, in the mark scheme's own clipped register.
  text: string

  marks: number
}

export interface GeneratedOption {
  // "A".."D"
  label: string

  text: string

  correct: boolean
}

export interface GeneratedSubPart {
  // "a", "b", or "i", "ii" beneath one.
  label: string

  text: string

  marks: number

  markScheme: GeneratedMarkPoint[]

  subParts?: GeneratedSubPart[]
}

export interface GeneratedQuestion {
  questionNumber: number

  topicNumber: number

  // The stem. Sub-part prose lives in `parts`, mirroring how Phase 3
  // reads a real paper, so a generated question and an extracted one
  // have the same shape.
  text: string

  parts: GeneratedSubPart[]

  // Multiple-choice only. Empty on a theory question.
  options: GeneratedOption[]

  marks: number

  assessmentObjective: string

  difficulty: DifficultyBand

  // Present on a question with no sub-parts; sub-part questions carry
  // their marking in `parts`.
  markScheme: GeneratedMarkPoint[]

  // Whether answering needs a figure. Recorded rather than drawn:
  // Phase 8 generates the diagram, and a paper that silently omits one
  // its question depends on is unanswerable.
  requiresDiagram: boolean

  // What the diagram must show, for Phase 8 to draw from.
  diagramBrief?: string

  // Ids of the retrieved chunks this question was generated from. Kept
  // so any question can be traced back to what it imitated — which is
  // what makes the originality check meaningful and a complaint
  // answerable.
  sourceChunkIds: string[]
}

export interface GeneratedPaper {
  syllabusCode: string

  title: string

  totalMarks: number

  questions: GeneratedQuestion[]

  // What produced it. A paper is an artefact someone may query months
  // later, and "which model wrote this" is the first question.
  generatorModel: string

  generatedAt: Date
}
