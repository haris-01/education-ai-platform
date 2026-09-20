import { describe, expect, it } from 'vitest'

import {
  mcqAnswer,
  mcqMarkScheme,
  option,
  paperExaminerReport,
  part,
  question,
  questionDocument,
  subPart,
  syllabusOverview,
  theoryMarkScheme,
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
        {
          questionNumber: 1,
          comment: 'Well answered by most candidates.',
          commonMistakes: [],
        },
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
        {
          questionNumber: 2,
          comment: 'Diagrams were often mislabelled.',
          commonMistakes: [],
        },
      ]),
    })

    expect(knowledge.questions[0].correctAnswer).toBe('A')
    expect(knowledge.questions[0].examinerCommentary).toBeUndefined()
    expect(knowledge.questions[1].correctAnswer).toBeUndefined()
    expect(knowledge.questions[1].examinerCommentary).toBe(
      'Diagrams were often mislabelled.'
    )
  })

  it('groups theory mark scheme sub-parts under their whole question', () => {
    const doc = questionDocument([
      question(2, 'A trolley collides with a spring.', { marks: 6 }),
    ])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
      theoryMarkScheme: theoryMarkScheme([
        {
          questionNumber: '2(a)(i)',
          markPoints: [{ text: '0.16 m/s', markCode: 'A3' }],
        },
        {
          questionNumber: '2(b)',
          markPoints: [
            { text: 'elastic energy store', markCode: 'B1' },
            { text: 'kinetic energy store', markCode: 'B1' },
          ],
        },
      ]),
    })

    expect(knowledge.questions[0].correctAnswer).toBeUndefined()
    expect(knowledge.questions[0].markingPoints).toEqual([
      { questionNumber: '2(a)(i)', text: '0.16 m/s', markCode: 'A3' },
      { questionNumber: '2(b)', text: 'elastic energy store', markCode: 'B1' },
      { questionNumber: '2(b)', text: 'kinetic energy store', markCode: 'B1' },
    ])
  })

  it('carries sub-part and option text, which the stem alone does not hold', () => {
    // Phase 5 embeds a question as one body of text. `text` is only the
    // stem, so dropping these would have embedded a fragment of every
    // theory question and none of any multiple-choice answer set.
    const doc = questionDocument([
      question(1, 'Fig. 1.1 shows a trolley on a ramp.', {
        parts: [
          part('a', 'Calculate the acceleration.', [
            subPart('i', 'State the equation you use.'),
          ]),
        ],
      }),
      question(2, 'Which row is correct?', {
        options: [option('A', '1.5 m/s'), option('B', '3.0 m/s')],
      }),
    ])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
    })

    expect(knowledge.questions[0].parts).toHaveLength(1)
    expect(knowledge.questions[0].parts[0]).toMatchObject({
      label: 'a',
      text: 'Calculate the acceleration.',
    })
    expect(knowledge.questions[0].parts[0].subParts[0]).toMatchObject({
      label: 'i',
      text: 'State the equation you use.',
    })
    expect(knowledge.questions[0].options).toEqual([])

    expect(knowledge.questions[1].options).toEqual([
      { label: 'A', text: '1.5 m/s' },
      { label: 'B', text: '3.0 m/s' },
    ])
    expect(knowledge.questions[1].parts).toEqual([])
  })

  it('carries the paper code through from the question paper', () => {
    const doc = questionDocument([question(1, 'Calculate the acceleration.')], {
      paper: { syllabusCode: '0625', code: '41', number: 4, variant: 1 },
    })

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
    })

    expect(knowledge.metadata.paper).toEqual({
      syllabusCode: '0625',
      code: '41',
      number: 4,
      variant: 1,
    })
  })

  it('leaves the paper code undefined when the paper does not print one', () => {
    const doc = questionDocument([question(1, 'Calculate the acceleration.')])

    const knowledge = buildKnowledgeDocument({
      questionDocument: doc,
      syllabus: SYLLABUS,
    })

    expect(knowledge.metadata.paper).toBeUndefined()
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
