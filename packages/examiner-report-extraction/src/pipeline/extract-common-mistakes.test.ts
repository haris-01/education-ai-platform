import { describe, expect, it } from 'vitest'

import { extractCommonMistakes } from './extract-common-mistakes'

describe('extractCommonMistakes', () => {
  // Every input below is real 0625 June 2024 examiner-report prose.
  it('collects an explicitly named common error', () => {
    const comment =
      'Most candidates identified a difference in motion. A common error was to give an answer about a change in state in the material, such as freezing or melting, rather than a thermal energy transfer process.'

    expect(extractCommonMistakes(comment)).toEqual([
      'A common error was to give an answer about a change in state in the material, such as freezing or melting, rather than a thermal energy transfer process.',
    ])
  })

  it('collects what weaker candidates did wrong', () => {
    const comment =
      'Weaker answers referred to inter-molecular spacing, energy or stated that particles are stationary in a solid.'

    expect(extractCommonMistakes(comment)).toHaveLength(1)
  })

  it('collects a misconception and an incorrect answer separately', () => {
    const comment =
      'A common misconception was to state that the wavelength refracts. Convection was the most common incorrect thermal process given.'

    expect(extractCommonMistakes(comment)).toEqual([
      'A common misconception was to state that the wavelength refracts.',
      'Convection was the most common incorrect thermal process given.',
    ])
  })

  it('does not collect sentences describing what good answers did', () => {
    // The discriminator is an explicit error word. Without it, praise
    // would be filed as a mistake, which is worse than missing one.
    const comment =
      'Stronger answers were well structured, described how acceleration changed and then explained this in terms of the forces acting on the ball. Most candidates gave a clear, concise definition of acceleration.'

    expect(extractCommonMistakes(comment)).toEqual([])
  })

  it('keeps "Fig. 5.1" in one piece', () => {
    // Exam commentary refers to figures constantly; splitting on the full
    // stop truncated this to "... the distance JK on Fig."
    const comment =
      'Some weaker candidates just measured the distance JK on Fig. 5.1 and gave this as an answer.'

    expect(extractCommonMistakes(comment)).toEqual([
      'Some weaker candidates just measured the distance JK on Fig. 5.1 and gave this as an answer.',
    ])
  })

  it('keeps "e.g." in one piece', () => {
    const comment =
      'Weaker candidates either drew a tangent in the wrong place, e.g. at t = 0 or did not draw a tangent.'

    expect(extractCommonMistakes(comment)).toEqual([comment])
  })

  it('strips the sub-part label a sentence starts with', () => {
    // The report runs sub-parts together as "(b) (i) Only the strongest
    // ...", so a collected mistake would otherwise start mid-label.
    const comment = '(b) (i) A common error was to give the wrong unit.'

    expect(extractCommonMistakes(comment)).toEqual([
      'A common error was to give the wrong unit.',
    ])
  })

  it('returns nothing for commentary with no mistake described', () => {
    const comment =
      'The vast majority of candidates correctly recalled and used the equation F = ma.'

    expect(extractCommonMistakes(comment)).toEqual([])
  })

  it('returns nothing for empty commentary', () => {
    expect(extractCommonMistakes('')).toEqual([])
    expect(extractCommonMistakes('   ')).toEqual([])
  })

  it('normalises the whitespace PDF extraction leaves behind', () => {
    const comment = 'A   common\n\n error   was\tto omit the unit.'

    expect(extractCommonMistakes(comment)).toEqual([
      'A common error was to omit the unit.',
    ])
  })
})
