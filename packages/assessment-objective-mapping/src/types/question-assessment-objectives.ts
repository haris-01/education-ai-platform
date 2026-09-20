// What kind of observation produced an objective. Each is a different
// strength of claim, so the caller can weigh them rather than treating
// every assignment as equally certain.
//
// - "paper": the syllabus states this paper's objective outright. The
//   strongest signal available; nothing in the text can override it.
// - "command-word": the question issues a published command word whose
//   meaning maps onto one objective's definition.
// - "quantitative-options": a multiple-choice question whose four options
//   are all bare quantities, so answering it required solving a numerical
//   problem — AO2's "solve problems, including some of a quantitative
//   nature". Weaker than the other two: it reads the answer list, not the
//   instruction.
export type AssessmentObjectiveSignal =
  'paper' | 'command-word' | 'quantitative-options'

// Why one signal was attributed to one assessment objective. Kept so a
// human can audit a call without re-running the mapper, the same reason
// topic-mapping keeps its `matchedKeywords`.
export interface AssessmentObjectiveEvidence {
  // "AO1"
  code: string

  signal: AssessmentObjectiveSignal

  // The sub-part this signal came from, as the exam labels it ("(a)",
  // "(b)(i)"). Undefined when it came from the question stem, or from a
  // signal that applies to the question as a whole.
  location?: string

  // The command word that produced this signal ("Calculate"). Only set
  // when `signal` is "command-word".
  commandWord?: string

  // Marks attached to the part this signal came from, when the paper
  // states them. Undefined for an unmarked stem or an unstated total.
  marks?: number
}

// Which assessment objectives one question assesses.
//
// A question is rarely a single objective: a theory question routinely
// opens with "Define ..." (AO1) and continues "Calculate ..." (AO2), so
// this models the mix rather than forcing one label onto the whole
// question.
export interface QuestionAssessmentObjectives {
  questionNumber: number

  // Distinct objectives assessed, in code order. Empty when nothing could
  // be determined — an honest gap, matching topic-mapping's unclassified
  // state, rather than defaulting to the most common objective.
  objectives: string[]

  // The objective carrying the most marks. Undefined when there is no
  // signal at all, or when two objectives tie — for a field downstream
  // stages treat as ground truth, a coin flip is worse than a gap.
  primaryObjective?: string

  // Marks attributed to each objective. Only includes objectives with
  // stated marks, so it can be empty even when `objectives` is not.
  marksByObjective: Record<string, number>

  evidence: AssessmentObjectiveEvidence[]
}

export interface QuestionAssessmentObjectiveMapMetadata {
  resourceId: string

  title: string

  extractedAt: Date

  extractorVersion: string
}

export interface QuestionAssessmentObjectiveMap {
  metadata: QuestionAssessmentObjectiveMapMetadata

  assignments: QuestionAssessmentObjectives[]
}
