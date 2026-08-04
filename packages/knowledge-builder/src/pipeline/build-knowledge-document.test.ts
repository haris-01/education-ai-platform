import { describe, expect, it } from 'vitest'

import {
  mcqAnswer,
  mcqMarkScheme,
  paperExaminerReport,
  question,
  questionDocument,
  syllabusOverview,
  topic,
} from '../test-fixtures'
import { buildKnowledgeDocument } from './build-knowledge-document'

const SYLLABUS = syllabusOverview([
  topic(1, 'Motion, forces and energy'),
  topic(3, 'Waves'),
])

describe('buildKnowledgeDocument', () => {
  it('joins topic, correct answer, and examiner commentary onto each question', () => {
    const doc = questionDocument([
      question(1, 'Calculate the resultant force on the mass.', { marks: 2 }),
    ])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
      mcqMarkScheme: mcqMarkScheme([mcqAnswer(1, 'B')]),
      examinerReport: paperExaminerReport('0625/41', [
        { questionNumber: 1, comment: 'Well answered by most candidates.' },
      ]),
    })

    expect(knowledge.questions).toHaveLength(1)
    expect(knowledge.questions[0]).toMatchObject({
      questionNumber: 1,
      marks: 2,
      topicNumber: 1,
      topicName: 'Motion, forces and energy',
      correctAnswer: 'B',
      examinerCommentary: 'Well answered by most candidates.',
    })
  })

  it('leaves enrichment fields undefined when their source document is absent', () => {
    const doc = questionDocument([question(1, 'Describe the procedure used.')])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
    })

    expect(knowledge.questions[0]).toMatchObject({
      questionNumber: 1,
      topicNumber: undefined,
      topicName: undefined,
      correctAnswer: undefined,
      examinerCommentary: undefined,
    })
  })

  it('leaves a question unenriched when the mark scheme or report does not cover it', () => {
    const doc = questionDocument([
      question(1, 'Calculate the acceleration.'),
      question(2, 'Describe the wave shown in the diagram.'),
    ])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
      mcqMarkScheme: mcqMarkScheme([mcqAnswer(1, 'A')]),
      examinerReport: paperExaminerReport('0625/41', [
        { questionNumber: 2, comment: 'Diagrams were often mislabelled.' },
      ]),
    })

    expect(knowledge.questions[0].correctAnswer).toBe('A')
    expect(knowledge.questions[0].examinerCommentary).toBeUndefined()
    expect(knowledge.questions[1].correctAnswer).toBeUndefined()
    expect(knowledge.questions[1].examinerCommentary).toBe(
      'Diagrams were often mislabelled.'
    )
  })

  it('carries the full syllabus topic and assessment-objective lists at document level', () => {
    const doc = questionDocument([question(1, 'Calculate the acceleration.')])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
    })

    expect(knowledge.topics).toEqual(SYLLABUS.topics)
    expect(knowledge.assessmentObjectives).toEqual(
      SYLLABUS.assessmentObjectives
    )
  })
})
