import { assignAssessmentObjectives } from '@education-ai/assessment-objective-mapping'
import type { QuestionAssessmentObjectives } from '@education-ai/assessment-objective-mapping'
import { estimateDifficulty } from '@education-ai/difficulty-estimation'
import type { DifficultyBand } from '@education-ai/difficulty-estimation'
import type { PaperExaminerReport } from '@education-ai/examiner-report-extraction'
import type {
  McqMarkScheme,
  TheoryMarkScheme,
} from '@education-ai/mark-scheme-extraction'
import type {
  Question,
  QuestionDocument,
} from '@education-ai/question-extraction'
import type { SyllabusOverview } from '@education-ai/syllabus-extraction'
import { assignTopics } from '@education-ai/topic-mapping'

import type {
  KnowledgeDocument,
  KnowledgeMarkingPoint,
  KnowledgeQuestion,
} from '../types/knowledge-document'

const EXTRACTOR_VERSION = '0.7.0'

export interface KnowledgeBuilderInput {
  questionDocument: QuestionDocument

  syllabus: SyllabusOverview

  // MCQ papers only.
  mcqMarkScheme?: McqMarkScheme

  // Theory papers only.
  theoryMarkScheme?: TheoryMarkScheme

  // A single paper's commentary, already selected by the caller from the
  // (possibly multi-paper) `ExaminerReport` — this builder works on one
  // question paper at a time, so paper selection stays the caller's job.
  examinerReport?: PaperExaminerReport
}

// Everything known about the questions in one paper, keyed by question
// number. Grouped into one object rather than passed as a growing list of
// positional map arguments, which had already reached five.
interface QuestionLookups {
  topic: Map<number, { topicNumber?: number; topicName?: string }>
  answer: Map<number, { answer: string }>
  markingPoints: Map<number, KnowledgeMarkingPoint[]>
  commentary: Map<number, { comment: string; commonMistakes: string[] }>
  assessmentObjectives: Map<number, QuestionAssessmentObjectives>
  difficulty: Map<number, DifficultyBand>
}

// Joins one question paper with everything the other Phase 4 extractors
// know about it — topic (via topic-mapping), assessment objectives (via
// assessment-objective-mapping), correct answer or marking points (via the
// MCQ or theory mark scheme), and examiner commentary — into the single
// rich `KnowledgeDocument` the roadmap defines as Phase 4's output. Pure
// join: no new inference happens here beyond what those mappers do.
export function buildKnowledgeDocument(
  input: KnowledgeBuilderInput
): KnowledgeDocument {
  const {
    questionDocument,
    syllabus,
    mcqMarkScheme,
    theoryMarkScheme,
    examinerReport,
  } = input

  const lookups: QuestionLookups = {
    topic: new Map(
      assignTopics(questionDocument, syllabus).assignments.map((a) => [
        a.questionNumber,
        a,
      ])
    ),
    answer: new Map(
      (mcqMarkScheme?.answers ?? []).map((a) => [a.questionNumber, a])
    ),
    markingPoints: groupMarkingPointsByQuestion(theoryMarkScheme),
    commentary: new Map(
      (examinerReport?.questionComments ?? []).map((c) => [c.questionNumber, c])
    ),
    assessmentObjectives: new Map(
      assignAssessmentObjectives(questionDocument, syllabus).assignments.map(
        (a) => [a.questionNumber, a]
      )
    ),
    difficulty: new Map(
      estimateDifficulty(questionDocument, examinerReport).assignments.flatMap(
        (a) => (a.band ? [[a.questionNumber, a.band] as const] : [])
      )
    ),
  }

  const questions = questionDocument.questions.map(
    (question): KnowledgeQuestion => buildKnowledgeQuestion(question, lookups)
  )

  return {
    metadata: {
      resourceId: questionDocument.metadata.resourceId,
      title: questionDocument.metadata.title,
      paper: questionDocument.metadata.paper,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    questions,
    topics: syllabus.topics,
    subTopics: syllabus.subTopics,
    assessmentObjectives: syllabus.assessmentObjectives,
  }
}

// Theory mark scheme rows are keyed by sub-part ("2(a)(i)"), one grain
// finer than `KnowledgeQuestion` models — grouped here under the leading
// question number so each whole question carries every sub-part's points.
function groupMarkingPointsByQuestion(
  theoryMarkScheme: TheoryMarkScheme | undefined
): Map<number, KnowledgeMarkingPoint[]> {
  return (theoryMarkScheme?.questions ?? []).reduce((map, entry) => {
    const questionNumber = leadingQuestionNumber(entry.questionNumber)
    if (questionNumber === undefined) {
      return map
    }
    const points = entry.markPoints.map((markPoint): KnowledgeMarkingPoint => ({
      ...markPoint,
      questionNumber: entry.questionNumber,
    }))
    return map.set(questionNumber, [
      ...(map.get(questionNumber) ?? []),
      ...points,
    ])
  }, new Map<number, KnowledgeMarkingPoint[]>())
}

function leadingQuestionNumber(ref: string): number | undefined {
  const match = ref.match(/^(\d+)/)
  return match ? Number(match[1]) : undefined
}

function buildKnowledgeQuestion(
  question: Question,
  lookups: QuestionLookups
): KnowledgeQuestion {
  const topic = lookups.topic.get(question.number)
  const answer = lookups.answer.get(question.number)
  const objectives = lookups.assessmentObjectives.get(question.number)
  const commentary = lookups.commentary.get(question.number)

  return {
    questionNumber: question.number,
    text: question.text,
    parts: question.parts,
    options: question.options,
    withdrawn: question.withdrawn,
    marks: question.marks,
    topicNumber: topic?.topicNumber,
    topicName: topic?.topicName,
    assessmentObjectives: objectives?.objectives ?? [],
    primaryAssessmentObjective: objectives?.primaryObjective,
    marksByAssessmentObjective: objectives?.marksByObjective ?? {},
    correctAnswer: answer?.answer,
    markingPoints: lookups.markingPoints.get(question.number),
    examinerCommentary: commentary?.comment,
    commonMistakes: commentary?.commonMistakes ?? [],
    difficulty: lookups.difficulty.get(question.number),
    imageRefs: question.imageRefs,
    drawingRefs: question.drawingRefs,
    tableRefs: question.tableRefs,
  }
}
