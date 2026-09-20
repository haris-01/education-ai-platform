import { describe, expect, it } from 'vitest'

import { trigramSimilarity } from './text-similarity'

describe('trigramSimilarity', () => {
  it('scores identical text as 1', () => {
    const text = 'A trolley of mass 2.0 kg rolls down a ramp.'

    expect(trigramSimilarity(text, text)).toBe(1)
  })

  it('catches a question rebuilt by swapping the numbers', () => {
    // The laziest way to "write a new question", and the case this
    // exists for. Nearly every trigram survives, so the score must stay
    // high even though every number changed.
    const original = 'A trolley of mass 2.0 kg rolls down a ramp of length 3 m'
    const lazy = 'A trolley of mass 3.5 kg rolls down a ramp of length 8 m'

    // 0.41 against a threshold measured at 0.35 — see check-originality.
    expect(trigramSimilarity(original, lazy)).toBeGreaterThan(0.35)
  })

  it('does not normalise digits away, or it would be blind to that', () => {
    const a = 'the mass is 2.0 kg exactly'
    const b = 'the mass is 9.9 kg exactly'

    expect(trigramSimilarity(a, b)).toBeLessThan(1)
  })

  it('scores two genuinely different questions on one topic low', () => {
    const a = 'Calculate the resultant force acting on the stationary block.'
    const b = 'Explain why a parachutist eventually falls at constant speed.'

    expect(trigramSimilarity(a, b)).toBeLessThan(0.2)
  })

  it('ignores case and punctuation, which differ between extractions', () => {
    const a = 'Calculate the resultant force on the mass.'
    const b = 'calculate the resultant force on the mass'

    expect(trigramSimilarity(a, b)).toBe(1)
  })

  it('compares short text as a unit rather than scoring it zero', () => {
    // Fewer than three words cannot be trigrammed; returning 0 would
    // make every short question uncatchable.
    expect(trigramSimilarity('State Newtons law', 'State Newtons law')).toBe(1)
    expect(trigramSimilarity('two words', 'two words')).toBe(1)
    expect(trigramSimilarity('two words', 'other text')).toBe(0)
  })

  it('scores empty text as 0 rather than throwing', () => {
    expect(trigramSimilarity('', 'anything at all here')).toBe(0)
    expect(trigramSimilarity('', '')).toBe(0)
  })

  it('is symmetric', () => {
    const a = 'A trolley of mass 2.0 kg rolls down a ramp'
    const b = 'A trolley of mass 3.5 kg rolls down a slope'

    expect(trigramSimilarity(a, b)).toBe(trigramSimilarity(b, a))
  })
})
