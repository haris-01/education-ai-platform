import type { DifficultyBand } from '@education-ai/difficulty-estimation'

export interface TopicSpec {
  topicNumber: number

  questionCount: number
}

// What a paper must be, before anything is generated.
//
// Separate from the prompt on purpose. This is the contract the result
// is checked against, and a check that reads the same prose the
// generator read would only confirm the generator did what it felt like.
// Everything here is machine-checkable, and `validatePaper` checks all
// of it.
export interface PaperSpec {
  // "0625"
  syllabusCode: string

  title: string

  // Which paper this is modelled on, e.g. "41". Used to exclude that
  // paper's own questions from retrieval — generating a replacement for
  // 0625/41 while reading 0625/41 produces a paraphrase of it.
  modelledOnPaperCode?: string

  totalMarks: number

  topics: TopicSpec[]

  // Marks per objective as percentages, from the syllabus's own
  // weighting table — 0625 is 50/30/20 across the qualification. Stated
  // in marks rather than question counts because that is how the board
  // states it.
  assessmentObjectiveWeights?: Record<string, number>

  // Target share of questions per band. A paper that comes out all one
  // band is not a paper, it is a worksheet.
  difficultyMix?: Partial<Record<DifficultyBand, number>>

  // How far an actual share may sit from its target before it counts as
  // a failure, in percentage points. Weightings are aspirations
  // expressed to the nearest whole number over a paper of a dozen
  // questions, so demanding exactness would fail every real paper —
  // including the board's own.
  tolerancePercent?: number
}
