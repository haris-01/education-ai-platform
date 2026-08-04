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

const EXTRACTOR_VERSION = '0.1.0'

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

// Joins one question paper with everything the other Phase 4 extractors
// know about it — topic (via topic-mapping), correct answer or marking
// points (via the MCQ or theory mark scheme), and examiner commentary —
// into the single rich `KnowledgeDocument` the roadmap defines as Phase
// 4's output. Pure join: no new inference happens here beyond the topic
// assignment it delegates to `assignTopics`.
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

  const topicByQuestion = new Map(
    assignTopics(questionDocument, syllabus).assignments.map((a) => [
      a.questionNumber,
      a,
    ])
  )
  const answerByQuestion = new Map(
    (mcqMarkScheme?.answers ?? []).map((a) => [a.questionNumber, a])
  )
  const markingPointsByQuestion = groupMarkingPointsByQuestion(theoryMarkScheme)
  const commentaryByQuestion = new Map(
    (examinerReport?.questionComments ?? []).map((c) => [
      c.questionNumber,
      c.comment,
    ])
  )

  const questions = questionDocument.questions.map(
    (question): KnowledgeQuestion =>
      buildKnowledgeQuestion(
        question,
        topicByQuestion,
        answerByQuestion,
        markingPointsByQuestion,
        commentaryByQuestion
      )
  )

  return {
    metadata: {
      resourceId: questionDocument.metadata.resourceId,
      title: questionDocument.metadata.title,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    questions,
    topics: syllabus.topics,
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
  topicByQuestion: Map<number, { topicNumber?: number; topicName?: string }>,
  answerByQuestion: Map<number, { answer: string }>,
  markingPointsByQuestion: Map<number, KnowledgeMarkingPoint[]>,
  commentaryByQuestion: Map<number, string>
): KnowledgeQuestion {
  const topic = topicByQuestion.get(question.number)
  const answer = answerByQuestion.get(question.number)
  const commentary = commentaryByQuestion.get(question.number)

  return {
    questionNumber: question.number,
    text: question.text,
    marks: question.marks,
    topicNumber: topic?.topicNumber,
    topicName: topic?.topicName,
    correctAnswer: answer?.answer,
    markingPoints: markingPointsByQuestion.get(question.number),
    examinerCommentary: commentary,
    imageRefs: question.imageRefs,
    drawingRefs: question.drawingRefs,
    tableRefs: question.tableRefs,
  }
}
