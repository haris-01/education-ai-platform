import { describe, expect, it } from 'vitest'

import { isWithdrawnNotice } from './detect-withdrawn'

describe('isWithdrawnNotice', () => {
  it('recognises the notice a board leaves in a withdrawn question slot', () => {
    // Verbatim from Cambridge 0625/21, June 2024, question 14.
    expect(
      isWithdrawnNotice(
        'Due to an issue with question 14, the question has been removed from the question paper.',
        false,
        false
      )
    ).toBe(true)
  })

  it('ignores whitespace and case, which PDFs supply unpredictably', () => {
    expect(
      isWithdrawnNotice(
        '  THE   QUESTION   HAS BEEN\n REMOVED FROM THE QUESTION PAPER  ',
        false,
        false
      )
    ).toBe(true)
  })

  it('does not touch a real question that mentions removal', () => {
    // The expensive mistake in both directions is this one: marking a
    // real question withdrawn silently deletes exam content.
    expect(
      isWithdrawnNotice(
        'A student removes the paper from the apparatus. Explain why the reading has been removed from the question paper record.',
        true,
        false
      )
    ).toBe(false)
  })

  it('will not mark anything carrying sub-parts or options', () => {
    const notice = 'the question has been removed from the question paper'

    expect(isWithdrawnNotice(notice, true, false)).toBe(false)
    expect(isWithdrawnNotice(notice, false, true)).toBe(false)
  })

  it('will not mark a long body, however it ends', () => {
    const long = `${'A trolley rolls down a ramp. '.repeat(20)} the question has been removed from the question paper`

    expect(isWithdrawnNotice(long, false, false)).toBe(false)
  })

  it('leaves ordinary questions alone', () => {
    expect(
      isWithdrawnNotice(
        'Calculate the resultant force on the mass.',
        false,
        false
      )
    ).toBe(false)
    expect(isWithdrawnNotice('', false, false)).toBe(false)
  })
})
