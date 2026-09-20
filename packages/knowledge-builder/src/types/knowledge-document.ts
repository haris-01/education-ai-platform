import type { DifficultyBand } from '@education-ai/difficulty-estimation'
import type { MarkPoint } from '@education-ai/mark-scheme-extraction'
import type {
  ElementRefs,
  QuestionOption,
  QuestionPart,
} from '@education-ai/question-extraction'
import type { PaperIdentity } from '@education-ai/shared'
import type {
  AssessmentObjective,
  SyllabusSubTopic,
  SyllabusTopic,
} from '@education-ai/syllabus-extraction'

// A theory mark scheme's `MarkPoint`, carrying forward the exam's own
// sub-part reference (e.g. "2(a)(i)") — `KnowledgeQuestion` only models
// whole questions, not sub-parts, so that reference is the one place the
// finer-grained location survives.
export interface KnowledgeMarkingPoint extends MarkPoint {
  questionNumber: string
}

// One question, enriched with everything the earlier Phase 4 extractors
// know about it. Every enrichment field is optional and stays `undefined`
// when its source document doesn't cover this question — a missing field
// is an honest gap, not a guess, same reasoning as topic-mapping's
// unclassified state.
export interface KnowledgeQuestion extends ElementRefs {
  questionNumber: number

  // The question stem only — the prose before the first sub-part. On a
  // theory paper most of the question lives in `parts`, so anything
  // reading a question as one body of text has to join the two.
  text: string

  // Sub-parts and sub-sub-parts, verbatim from the question paper, with
  // their own marks and element references. Empty for a multiple-choice
  // question, which has no parts.
  parts: QuestionPart[]

  // Multiple-choice options ("A".."D"). Empty on a theory paper. Which
  // one is correct is `correctAnswer`, which comes from the mark scheme.
  options: QuestionOption[]

  // True when the paper printed a withdrawal notice in this slot instead
  // of a question. Carried through so consumers can skip it; see
  // `Question.withdrawn`.
  withdrawn: boolean

  marks?: number

  topicNumber?: number

  topicName?: string

  // Assessment objectives this question tests ("AO1", "AO2", "AO3"), in
  // code order. Empty when none could be determined — most often a
  // multiple-choice question with descriptive options, where telling
  // recall from problem-solving needs more than text matching.
  assessmentObjectives: string[]

  // The objective carrying the most marks. Undefined when nothing was
  // determined, or when two objectives tie.
  primaryAssessmentObjective?: string

  // Marks per objective. Phase 7 needs this to balance a generated paper
  // against the syllabus's own weightings (0625 is 50% AO1 / 30% AO2 /
  // 20% AO3), which are stated in marks, not question counts.
  marksByAssessmentObjective: Record<string, number>

  // MCQ only ("A"-"D", or "Discounted") — from the MCQ mark scheme.
  // Undefined for theory questions (see `markingPoints` instead) or when
  // no mark scheme was supplied.
  correctAnswer?: string

  // Theory papers only — every marking point across this question's
  // sub-parts, from the theory mark scheme. Undefined for MCQ questions
  // (see `correctAnswer` instead) or when no theory mark scheme was
  // supplied.
  markingPoints?: KnowledgeMarkingPoint[]

  // The examiner's commentary for this question, verbatim from the
  // examiner report. Undefined when no examiner report was supplied, or
  // when the report doesn't mention this question.
  examinerCommentary?: string

  // The sentences of `examinerCommentary` that describe what candidates
  // got wrong, verbatim. Empty when there is no commentary, or when the
  // examiner recorded no error for this question.
  commonMistakes: string[]

  // How hard this question proved for the candidates who sat it, read
  // from the examiner's description of their performance. Undefined
  // without an examiner report, or when the report says nothing
  // measurable about this question — which is most multiple-choice
  // questions, since the report only discusses the notable ones.
  difficulty?: DifficultyBand
}

export interface KnowledgeDocumentMetadata {
  resourceId: string

  title: string

  // Which paper this knowledge came from, read off the document's own
  // printed code (e.g. "0625/41"). Carried through from the question
  // paper unchanged, and undefined for the same reasons it is undefined
  // there — see `findPaperIdentity`.
  paper?: PaperIdentity

  extractedAt: Date

  extractorVersion: string
}

export interface KnowledgeDocument {
  metadata: KnowledgeDocumentMetadata

  questions: KnowledgeQuestion[]

  // Document-level syllabus context — not mapped per question yet, so it
  // travels alongside the question list rather than inside each entry.
  topics: SyllabusTopic[]

  // The syllabus's learning objectives, as sub-topics and their sections.
  // Document-level for the same reason as `topics`: mapping an individual
  // question to the specific objective it tests needs semantic matching,
  // which is Phase 5/6 work — keyword matching is only good enough for
  // the topic level (see topic-mapping).
  subTopics: SyllabusSubTopic[]

  assessmentObjectives: AssessmentObjective[]
}
