import { describe, expect, it } from 'vitest'

import {
  PAPER_41,
  knowledgeDocument,
  knowledgeQuestion,
} from '../test-fixtures'
import { chunkExaminerInsights } from './chunk-examiner-insights'

describe('chunkExaminerInsights', () => {
  it('chunks only the questions the examiner commented on', () => {
    // The report discusses the notable questions, not all of them. A
    // chunk per question regardless would fill the store with empties.
    const document = knowledgeDocument(
      [
        knowledgeQuestion(1, 'Calculate the acceleration.', {
          examinerCommentary: 'Most candidates used the wrong equation.',
          commonMistakes: ['Most candidates used the wrong equation.'],
          topicNumber: 1,
          topicName: 'Motion, forces and energy',
        }),
        knowledgeQuestion(2, 'State the unit of force.'),
      ],
      { paper: PAPER_41 }
    )

    const chunks = chunkExaminerInsights(document)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].metadata.questionNumber).toBe(1)
  })

  it('keeps the commentary verbatim so it stays quotable', () => {
    const commentary =
      'Most stronger candidates chose the correct option, but weaker candidates confused reflection with refraction.'
    const document = knowledgeDocument(
      [
        knowledgeQuestion(4, 'Which diagram shows refraction?', {
          examinerCommentary: commentary,
          commonMistakes: ['weaker candidates confused reflection'],
        }),
      ],
      { paper: PAPER_41 }
    )

    const [chunk] = chunkExaminerInsights(document)

    expect(chunk.content).toContain(commentary)
    expect(chunk.payload.examinerCommentary).toBe(commentary)
    expect(chunk.payload.commonMistakes).toEqual([
      'weaker candidates confused reflection',
    ])
  })

  it('does not chunk commentary attached to a withdrawn question', () => {
    const document = knowledgeDocument(
      [
        knowledgeQuestion(14, 'The question has been removed.', {
          withdrawn: true,
          examinerCommentary: 'This question was removed before marking.',
        }),
      ],
      { paper: PAPER_41 }
    )

    expect(chunkExaminerInsights(document)).toEqual([])
  })

  it('does not collide with the question chunk for the same question', () => {
    const document = knowledgeDocument(
      [
        knowledgeQuestion(4, 'Which diagram shows refraction?', {
          examinerCommentary: 'Well answered.',
        }),
      ],
      { paper: PAPER_41 }
    )

    const [chunk] = chunkExaminerInsights(document)

    expect(chunk.id).toBe('CAM-0625-MJ-2024-41-QP:examinerInsight:4')
    expect(chunk.chunkType).toBe('examinerInsight')
  })
})
