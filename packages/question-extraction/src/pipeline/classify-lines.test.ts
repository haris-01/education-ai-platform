import { describe, expect, it } from 'vitest'

import { line } from '../test-fixtures'
import { classifyLines } from './classify-lines'

describe('classifyLines', () => {
  it('classifies a question-number line', () => {
    const [classified] = classifyLines([
      line(1, '4 Two runners take part in a race.', 50, 62),
    ])
    expect(classified.role).toBe('questionNumber')
    expect(classified.questionNumber).toBe(4)
    expect(classified.content).toBe('Two runners take part in a race.')
  })

  it('classifies a sub-part label', () => {
    const [classified] = classifyLines([
      line(1, '(a) Calculate the acceleration.', 72, 100),
    ])
    expect(classified.role).toBe('subpart')
    expect(classified.partLabel).toBe('a')
    expect(classified.content).toBe('Calculate the acceleration.')
  })

  it('classifies a sub-sub-part roman numeral', () => {
    const [classified] = classifyLines([
      line(1, '(i) Calculate the momentum.', 96, 140),
    ])
    expect(classified.role).toBe('subSubpart')
    expect(classified.partLabel).toBe('i')
  })

  it('never reads i, v, or x as a sub-part letter (reserved for roman numerals)', () => {
    const results = classifyLines([
      line(1, '(v) some content here', 72, 100),
      line(1, '(x) more content here', 72, 120),
    ])
    expect(results.every((r) => r.role === 'subSubpart')).toBe(true)
  })

  it('captures an embedded sub-part on a question-number line', () => {
    const [classified] = classifyLines([
      line(1, '2 (a) Complete the definitions.', 50, 62),
    ])
    expect(classified.role).toBe('questionNumber')
    expect(classified.questionNumber).toBe(2)
    expect(classified.partLabel).toBe('a')
    expect(classified.content).toBe('Complete the definitions.')
  })

  it('captures an embedded sub-sub-part nested under an embedded sub-part', () => {
    const [classified] = classifyLines([
      line(1, '3 (a) (i) State the name of the process.', 50, 62),
    ])
    expect(classified.questionNumber).toBe(3)
    expect(classified.partLabel).toBe('a')
    expect(classified.nestedPartLabel).toBe('i')
    expect(classified.content).toBe('State the name of the process.')
  })

  it('extracts a trailing mark count', () => {
    const [classified] = classifyLines([
      line(1, 'acceleration = .......... [3]', 95, 200),
    ])
    expect(classified.marks).toBe(3)
    expect(classified.role).toBe('body')
  })

  it('extracts a total-marks line without it also reading as a per-line mark', () => {
    const [classified] = classifyLines([line(1, '[Total: 8]', 504, 300)])
    expect(classified.totalMarks).toBe(8)
    expect(classified.marks).toBeUndefined()
  })

  describe('boilerplate', () => {
    it('flags a copyright footer', () => {
      const [classified] = classifyLines([
        line(1, '© UCLES 2020 0625/04/SP/23', 50, 780),
      ])
      expect(classified.role).toBe('boilerplate')
    })

    it('flags a "BLANK PAGE" marker', () => {
      const [classified] = classifyLines([line(1, 'BLANK PAGE', 262, 400)])
      expect(classified.role).toBe('boilerplate')
    })

    it('flags a bare page number near the top of the page', () => {
      const [classified] = classifyLines([line(1, '8', 295, 36)])
      expect(classified.role).toBe('boilerplate')
    })

    it('does not flag a bare number that is real mid-page content (e.g. a graph axis label)', () => {
      const [classified] = classifyLines([line(1, '0', 198, 256)])
      expect(classified.role).not.toBe('boilerplate')
    })
  })

  it('does not misread an indented measurement as a question number', () => {
    // "30 cm 70 cm" sits well right of the margin, inside a diagram —
    // matches the question-number pattern textually but must not pass
    // the margin check.
    const results = classifyLines([
      line(1, '1 A length of string is measured.', 50, 62),
      line(1, '30 cm 70 cm', 181, 99),
      line(1, '© UCLES 2020', 50, 780),
      line(2, '2 Another separate question stem.', 50, 62),
    ])
    const decoy = results.find((r) => r.line.text === '30 cm 70 cm')
    expect(decoy?.role).toBe('body')
  })

  it('derives the margin from the smallest recurring indent, not the most common one', () => {
    // A document where nested sub-part continuation lines (x=95) genuinely
    // outnumber the margin lines (x=50) — confirmed against a real paper
    // where picking the most-common x here misread a numbered
    // answer-blank list ("1 ....", "2 ....") as new question numbers.
    const results = classifyLines([
      line(1, '5 (a) Describe how a wave differs.', 50, 62),
      line(1, 'continuation one', 95, 90),
      line(1, 'continuation two', 95, 110),
      line(1, 'continuation three', 95, 130),
      line(1, 'continuation four', 95, 150),
      line(1, '© UCLES 2020', 50, 780),
      line(2, '9 The Sun is one of many stars.', 50, 62),
      line(2, '1 first blank ....', 95, 90),
      line(2, '2 second blank ....', 95, 110),
      line(2, '3 third blank ....', 95, 130),
    ])

    const questionNumbers = results
      .filter((r) => r.role === 'questionNumber')
      .map((r) => r.questionNumber)

    expect(questionNumbers).toEqual([5, 9])
  })

  it('splits options packed onto a single line into four separate options', () => {
    const results = classifyLines([
      line(1, 'A 2.2 cm B 2.6 cm C 13.2 cm D 15.6 cm', 72, 200),
    ])
    expect(results).toHaveLength(4)
    expect(results.map((r) => r.optionLabel)).toEqual(['A', 'B', 'C', 'D'])
    expect(results.map((r) => r.content)).toEqual([
      '2.2 cm',
      '2.6 cm',
      '13.2 cm',
      '15.6 cm',
    ])
  })

  it('flags a single option-shaped line as a candidate, not a confirmed role', () => {
    const [classified] = classifyLines([
      line(1, 'A Both runners are moving at the same speed.', 72, 292),
    ])
    expect(classified.role).toBe('body')
    expect(classified.optionLabel).toBe('A')
    expect(classified.content).toBe(
      'Both runners are moving at the same speed.'
    )
  })
})
