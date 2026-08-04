import type { ElementRefs } from '@education-ai/question-extraction'
import type {
  AssessmentObjective,
  SyllabusTopic,
} from '@education-ai/syllabus-extraction'

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

  // MCQ only ("A"-"D", or "Discounted") — from the mark scheme. Undefined
  // for theory questions (mark scheme coverage is MCQ-only, see
  // mark-scheme-extraction) or when no mark scheme was supplied.
  correctAnswer?: string

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
