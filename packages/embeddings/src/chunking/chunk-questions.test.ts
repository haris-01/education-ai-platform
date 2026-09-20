import { describe, expect, it } from 'vitest'

import {
  PAPER_41,
  knowledgeDocument,
  knowledgeQuestion,
  option,
  part,
  subPart,
} from '../test-fixtures'
import { chunkQuestions } from './chunk-questions'

describe('chunkQuestions', () => {
  it('embeds the whole question, not just the stem', () => {
    const document = knowledgeDocument(
      [
        knowledgeQuestion(3, 'Fig. 3.1 shows a trolley on a ramp.', {
          marks: 6,
          topicNumber: 1,
          topicName: 'Motion, forces and energy',
          parts: [
            part('a', 'Calculate the acceleration of the trolley.', [
              subPart('i', 'State the equation you use.'),
            ]),
            part('b', 'Explain why the trolley slows down.'),
          ],
        }),
      ],
      { paper: PAPER_41 }
    )

    const [chunk] = chunkQuestions(document)

    expect(chunk.content).toContain('Fig. 3.1 shows a trolley on a ramp.')
    expect(chunk.content).toContain('(a) Calculate the acceleration')
    expect(chunk.content).toContain('(i) State the equation you use.')
    expect(chunk.content).toContain('(b) Explain why the trolley slows down.')
  })

  it('heads each chunk with the paper, topic, question and marks', () => {
    const document = knowledgeDocument(
      [
        knowledgeQuestion(3, 'Calculate the acceleration.', {
          marks: 6,
          topicNumber: 1,
          topicName: 'Motion, forces and energy',
        }),
      ],
      { paper: PAPER_41 }
    )

    const [chunk] = chunkQuestions(document)

    expect(chunk.content.split('\n')[0]).toBe(
      'Paper 0625/41 — Topic 1: Motion, forces and energy — Question 3 — 6 marks'
    )
  })

  it('omits header parts the document does not know', () => {
    // An unclassified question must not get a header reading "Topic
    // undefined" — that would embed noise the query can match on.
    const document = knowledgeDocument([
      knowledgeQuestion(1, 'Describe the procedure used.'),
    ])

    const [chunk] = chunkQuestions(document)

    expect(chunk.content.split('\n')[0]).toBe('Question 1')
    expect(chunk.content).not.toContain('undefined')
  })

  it('renders multiple-choice options into the embedded text', () => {
    const document = knowledgeDocument([
      knowledgeQuestion(7, 'Which row is correct?', {
        options: [option('A', '1.5 m/s'), option('B', '3.0 m/s')],
        correctAnswer: 'B',
      }),
    ])

    const [chunk] = chunkQuestions(document)

    expect(chunk.content).toContain('A 1.5 m/s')
    expect(chunk.content).toContain('B 3.0 m/s')
    // The answer is retrievable but deliberately not embedded: no query
    // for a physics concept is looking for the letter B.
    expect(chunk.payload.correctAnswer).toBe('B')
    expect(chunk.content).not.toContain('Correct answer')
  })

  it('gives every chunk a deterministic id and hash', () => {
    const document = knowledgeDocument(
      [knowledgeQuestion(3, 'Calculate the acceleration.')],
      { paper: PAPER_41 }
    )

    const first = chunkQuestions(document)
    const second = chunkQuestions(document)

    expect(first[0].id).toBe('CAM-0625-MJ-2024-41-QP:question:3')
    expect(first[0].contentHash).toBe(second[0].contentHash)
    expect(first[0].contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('carries the filterable metadata a query needs', () => {
    const document = knowledgeDocument(
      [
        knowledgeQuestion(3, 'Calculate the acceleration.', {
          marks: 6,
          topicNumber: 1,
          topicName: 'Motion, forces and energy',
          assessmentObjectives: ['AO1', 'AO2'],
          primaryAssessmentObjective: 'AO2',
          difficulty: 'high',
          imageRefs: ['image-1'],
        }),
      ],
      { paper: PAPER_41 }
    )

    const [chunk] = chunkQuestions(document)

    expect(chunk.metadata).toMatchObject({
      syllabusCode: '0625',
      paperCode: '41',
      questionNumber: 3,
      topicNumber: 1,
      assessmentObjectives: ['AO1', 'AO2'],
      primaryAssessmentObjective: 'AO2',
      difficulty: 'high',
      marks: 6,
      hasDiagram: true,
    })
  })

  it('does not chunk a withdrawal notice at all', () => {
    // Boards leave "the question has been removed from the question
    // paper" in a withdrawn question's slot. Embedding it would spend
    // money putting an administrative notice into a store whose purpose
    // is answering questions about physics.
    const document = knowledgeDocument([
      knowledgeQuestion(13, 'Calculate the acceleration.'),
      knowledgeQuestion(
        14,
        'Due to an issue with question 14, the question has been removed from the question paper.',
        { withdrawn: true }
      ),
      knowledgeQuestion(15, 'State the unit of force.'),
    ])

    const chunks = chunkQuestions(document)

    expect(chunks.map((chunk) => chunk.metadata.questionNumber)).toEqual([
      13, 15,
    ])
  })

  it('marks a multiple-choice question with no options as unfit to imitate', () => {
    // Phase 3 defers options laid out around a diagram, so some MCQ
    // questions arrive with a stem and none of the answers that give it
    // meaning. They stay searchable — they are real content — but a
    // generator shown one would learn to write questions with no
    // answers.
    const document = knowledgeDocument([
      knowledgeQuestion(1, 'Which row is correct?', {
        options: [option('A', '1.5 m/s'), option('B', '3.0 m/s')],
      }),
      knowledgeQuestion(2, 'Which row is correct?', {
        options: [option('A', '10 N'), option('B', '20 N')],
      }),
      knowledgeQuestion(3, 'Which diagram shows waves diffracting?'),
    ])

    const chunks = chunkQuestions(document)

    expect(chunks.map((chunk) => chunk.metadata.isExemplar)).toEqual([
      true,
      true,
      false,
    ])
  })

  it('reads whether options are expected off the paper, not a paper number', () => {
    // "Papers 1 and 2 are multiple choice" is a Cambridge convention.
    // A theory paper has no options anywhere, and none of its questions
    // should be called incomplete for that.
    const theory = knowledgeDocument([
      knowledgeQuestion(1, 'Calculate the acceleration.', {
        parts: [part('a', 'State the equation you use.')],
      }),
      knowledgeQuestion(2, 'Explain why the trolley slows down.'),
    ])

    chunkQuestions(theory).forEach((chunk) => {
      expect(chunk.metadata.isExemplar).toBe(true)
    })
  })

  it('marks a question with no figure, drawing or table as diagramless', () => {
    const document = knowledgeDocument([
      knowledgeQuestion(1, 'State the unit of force.'),
    ])

    expect(chunkQuestions(document)[0].metadata.hasDiagram).toBe(false)
  })
})
