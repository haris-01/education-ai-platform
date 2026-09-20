import { describe, expect, it } from 'vitest'

import { page, parsedDocument, textElement } from '../test-fixtures'
import { buildMcqMarkScheme } from './build-mcq-mark-scheme'

describe('buildMcqMarkScheme', () => {
  it('extracts a clean answer key', () => {
    const p = page(1, [
      textElement(1, 'Question Answer Marks', 56, 68),
      textElement(1, '1 A 1', 77, 87),
      textElement(1, '2 A 1', 77, 106),
      textElement(1, '3 C 1', 77, 126),
    ])

    const { answers } = buildMcqMarkScheme(parsedDocument([p]))

    expect(answers).toEqual([
      { questionNumber: 1, answer: 'A', marks: 1 },
      { questionNumber: 2, answer: 'A', marks: 1 },
      { questionNumber: 3, answer: 'C', marks: 1 },
    ])
  })

  it('accumulates answers across pages', () => {
    const p1 = page(1, [
      textElement(1, 'Question Answer Marks', 56, 68),
      textElement(1, '1 A 1', 77, 87),
    ])
    const p2 = page(2, [
      textElement(2, 'Question Answer Marks', 56, 68),
      textElement(2, '2 B 1', 77, 87),
    ])

    const { answers } = buildMcqMarkScheme(parsedDocument([p1, p2]))

    expect(answers).toEqual([
      { questionNumber: 1, answer: 'A', marks: 1 },
      { questionNumber: 2, answer: 'B', marks: 1 },
    ])
  })

  it('captures a discounted question instead of silently dropping it', () => {
    // Regression: Cambridge can void a question after the exam if it's
    // found to be flawed — "14 Question Discounted 1" instead of a
    // lettered answer. Confirmed against a real past paper.
    const p = page(1, [
      textElement(1, '13 D 1', 75, 386),
      textElement(1, '14 Question Discounted 1', 75, 410),
      textElement(1, '15 A 1', 75, 435),
    ])

    const { answers } = buildMcqMarkScheme(parsedDocument([p]))

    expect(answers).toEqual([
      { questionNumber: 13, answer: 'D', marks: 1 },
      { questionNumber: 14, answer: 'Discounted', marks: 1 },
      { questionNumber: 15, answer: 'A', marks: 1 },
    ])
  })

  it('ignores headers and footer boilerplate', () => {
    const p = page(1, [
      textElement(1, '0625/01 Cambridge IGCSE – Mark Scheme', 50, 21),
      textElement(1, 'Question Answer Marks', 56, 68),
      textElement(1, '1 A 1', 77, 87),
      textElement(1, '© UCLES 2020 Page 2 of 4', 50, 797),
    ])

    const { answers } = buildMcqMarkScheme(parsedDocument([p]))

    expect(answers).toEqual([{ questionNumber: 1, answer: 'A', marks: 1 }])
  })

  it('returns no answers for a document with no matching rows', () => {
    const p = page(1, [textElement(1, 'BLANK PAGE', 262, 62)])
    expect(buildMcqMarkScheme(parsedDocument([p])).answers).toEqual([])
  })
})
