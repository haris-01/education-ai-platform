import { describe, expect, it } from 'vitest'

import { paperCode, parsePaperCode } from './paper-code.js'

describe('paperCode', () => {
  it('joins paper and variant', () => {
    expect(paperCode(4, 1)).toBe('41')
  })

  it('omits the variant when there is none', () => {
    expect(paperCode(4)).toBe('4')
  })
})

describe('parsePaperCode', () => {
  it('parses the front-page form', () => {
    expect(parsePaperCode('0625/41')).toEqual({
      syllabusCode: '0625',
      code: '41',
      number: 4,
      variant: 1,
    })
  })

  it('parses the page-footer form and drops the session', () => {
    // The footer repeats the code with the session appended. The session
    // is deliberately not carried through — the dataset path already
    // records it.
    expect(parsePaperCode('0625/41/M/J/24')).toEqual({
      syllabusCode: '0625',
      code: '41',
      number: 4,
      variant: 1,
    })
  })

  it('parses a specimen paper, whose code is zero-padded not variant-suffixed', () => {
    // Cambridge prints specimen papers as "0625/05", not "0625/5". The
    // second digit is the paper number, not a variant — reading it as a
    // variant would report paper 0.
    expect(parsePaperCode('0625/05')).toEqual({
      syllabusCode: '0625',
      code: '5',
      number: 5,
      variant: undefined,
    })
  })

  it('parses the specimen page-footer form, with its SP session', () => {
    expect(parsePaperCode('0625/06/SP/23')).toEqual({
      syllabusCode: '0625',
      code: '6',
      number: 6,
      variant: undefined,
    })
  })

  it('parses a single-digit paper number', () => {
    expect(parsePaperCode('0625/4')).toEqual({
      syllabusCode: '0625',
      code: '4',
      number: 4,
      variant: undefined,
    })
  })

  it('normalises the padded and bare forms to the same code', () => {
    expect(parsePaperCode('0625/05')).toEqual(parsePaperCode('0625/5'))
  })

  it('round-trips through paperCode', () => {
    const identity = parsePaperCode('0625/41')
    expect(identity && paperCode(identity.number, identity.variant)).toBe(
      identity?.code
    )
  })

  it('tolerates surrounding whitespace', () => {
    expect(parsePaperCode('  0625/61  ')?.code).toBe('61')
  })

  it.each([
    ['not a code at all', 'Cambridge IGCSE'],
    ['a bare syllabus code', '0625'],
    ['a date that looks similar', '12/05/2024'],
    ['too few syllabus digits', '625/41'],
    ['too many paper digits', '0625/411'],
    ['a padded code with no paper digit', '0625/0'],
    ['a fraction inside question text', '1/2'],
    ['a code with trailing prose', '0625/41 Paper 4 Theory'],
  ])('returns undefined for %s', (_label, value) => {
    expect(parsePaperCode(value)).toBeUndefined()
  })
})
