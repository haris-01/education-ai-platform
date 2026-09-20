import { describe, expect, it } from 'vitest'

import { page, textElement } from '../test-fixtures'
import { reconstructLines } from './reconstruct-lines'

describe('reconstructLines', () => {
  it('merges same-row runs into one line, ordered left to right', () => {
    const p = page(1, [
      textElement(1, 'world', 40, 100),
      textElement(1, 'hello', 10, 100),
    ])

    const lines = reconstructLines(p)

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('hello world')
  })

  it('keeps visually distinct rows as separate lines', () => {
    const p = page(1, [
      textElement(1, 'first line', 10, 100),
      textElement(1, 'second line', 10, 140),
    ])

    const lines = reconstructLines(p)

    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.text)).toEqual(['first line', 'second line'])
  })

  it('tolerates small baseline jitter within one row (e.g. a subscript)', () => {
    const p = page(1, [
      textElement(1, 'CO', 10, 100),
      textElement(1, '2', 30, 102, { height: 8 }),
    ])

    const lines = reconstructLines(p)

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('CO 2')
  })

  it('drops whitespace-only and empty runs, but keeps real content around them', () => {
    const p = page(1, [
      textElement(1, 'PHYSICS', 10, 100),
      textElement(1, ' ', 60, 100),
      textElement(1, '', 90, 100, { width: 0 }),
      textElement(1, '0625/04', 100, 100),
    ])

    const lines = reconstructLines(p)

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('PHYSICS 0625/04')
  })

  it('returns nothing for a page with no text', () => {
    expect(reconstructLines(page(1, []))).toEqual([])
  })
})
