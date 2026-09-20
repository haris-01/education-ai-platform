import { describe, expect, it } from 'vitest'

import { page, parsedDocument, textElement } from '../test-fixtures'
import { findPaperIdentity } from './find-paper-identity'

describe('findPaperIdentity', () => {
  it('reads the code from the front page', () => {
    const document = parsedDocument([
      page(1, [
        textElement(1, 'PHYSICS', 100, 200),
        textElement(1, '0625/41', 400, 200),
        textElement(1, 'Paper 4 Theory (Extended)', 100, 220),
      ]),
    ])

    expect(findPaperIdentity(document)).toEqual({
      syllabusCode: '0625',
      code: '41',
      number: 4,
      variant: 1,
    })
  })

  it('reads the code from a page footer when the front page has none', () => {
    const document = parsedDocument([
      page(1, [textElement(1, 'Cambridge IGCSE', 100, 100)]),
      page(2, [textElement(2, '0625/61/M/J/24', 200, 40)]),
    ])

    expect(findPaperIdentity(document)?.code).toBe('61')
  })

  it('accepts the front page and footers naming the same paper', () => {
    // The real shape of a Cambridge paper: "0625/41" once on the cover,
    // then "0625/41/M/J/24" repeated in every later footer.
    const document = parsedDocument([
      page(1, [textElement(1, '0625/41', 400, 200)]),
      page(2, [textElement(2, '0625/41/M/J/24', 200, 40)]),
      page(3, [textElement(3, '0625/41/M/J/24', 200, 40)]),
    ])

    expect(findPaperIdentity(document)?.number).toBe(4)
  })

  it('returns undefined when the document prints no code', () => {
    const document = parsedDocument([
      page(1, [textElement(1, 'Cambridge IGCSE Physics', 100, 100)]),
    ])

    expect(findPaperIdentity(document)).toBeUndefined()
  })

  it('returns undefined when codes disagree', () => {
    // A mark scheme covering several variants would look like this.
    // Guessing one of them would hand a later stage a confident wrong
    // answer, so the gap is reported instead.
    const document = parsedDocument([
      page(1, [textElement(1, '0625/41', 400, 200)]),
      page(2, [textElement(2, '0625/42', 200, 40)]),
    ])

    expect(findPaperIdentity(document)).toBeUndefined()
  })

  it('ignores fractions and dates in question text', () => {
    const document = parsedDocument([
      page(1, [
        textElement(1, '1/2', 100, 300),
        textElement(1, '12/05/2024', 100, 320),
        textElement(1, '0625/31', 400, 200),
      ]),
    ])

    expect(findPaperIdentity(document)?.code).toBe('31')
  })
})
