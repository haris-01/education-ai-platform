import { describe, expect, it } from 'vitest'

import { stripBackMatter } from './strip-back-matter'

const COPYRIGHT =
  'Permission to reproduce items where third-party owned material protected by copyright is included has been sought and cleared where possible.'

describe('stripBackMatter', () => {
  it('removes the copyright notice the last question absorbs', () => {
    // Verbatim shape from Cambridge 0625/11 question 40.
    expect(stripBackMatter(`What is a light-year? ${COPYRIGHT}`)).toBe(
      'What is a light-year?'
    )
  })

  it('removes everything after the opener, not just the phrase', () => {
    const text = `What is a light-year? ${COPYRIGHT} Cambridge Assessment is the brand name of UCLES.`

    expect(stripBackMatter(text)).toBe('What is a light-year?')
  })

  it('cuts at the earliest opener when several appear', () => {
    const text = `A real question. Blank page. ${COPYRIGHT}`

    expect(stripBackMatter(text)).toBe('A real question.')
  })

  it('matches whatever case the extraction produced', () => {
    expect(stripBackMatter('A question. BLANK PAGE')).toBe('A question.')
  })

  it('leaves an ordinary question untouched', () => {
    const text = 'Calculate the resultant force acting on the trolley.'

    expect(stripBackMatter(text)).toBe(text)
  })

  it('does not fire on a question that merely mentions copyright', () => {
    // Conservative on purpose: truncating a real question silently
    // deletes exam content, which is worse than leaving boilerplate in.
    const text =
      'A student copies a diagram. Explain why copyright applies to the published material.'

    expect(stripBackMatter(text)).toBe(text)
  })

  it('handles empty text', () => {
    expect(stripBackMatter('')).toBe('')
  })
})
