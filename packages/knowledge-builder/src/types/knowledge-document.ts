import type { MarkPoint } from '@education-ai/mark-scheme-extraction'
import type { ElementRefs } from '@education-ai/question-extraction'
import type {
  AssessmentObjective,
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
// unclassified state. Fields the roadmap lists but no extractor produces
// yet (AO1/AO2/AO3 per question, difficulty, common mistakes, learning
// objectives) are deliberately absent rather than faked.
export interface KnowledgeQuestion extends ElementRefs {
  questionNumber: number

  text: string

  marks?: number

  topicNumber?: number

  topicName?: string

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
}

export interface KnowledgeDocumentMetadata {
  resourceId: string

  title: string

  extractedAt: Date

  extractorVersion: string
}

export interface KnowledgeDocument {
  metadata: KnowledgeDocumentMetadata

  questions: KnowledgeQuestion[]

  // Document-level syllabus context — not mapped per question yet, so it
  // travels alongside the question list rather than inside each entry.
  topics: SyllabusTopic[]

  assessmentObjectives: AssessmentObjective[]
}
