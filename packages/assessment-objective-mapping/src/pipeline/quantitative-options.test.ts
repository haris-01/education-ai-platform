import { describe, expect, it } from 'vitest'

import {
  hasQuantitativeOptions,
  isQuantityOption,
} from './quantitative-options'

describe('isQuantityOption', () => {
  // Every string here is real option text from a Cambridge 0625 paper.
  it.each([
    '19 mm',
    '29 cm',
    '0.80 g / cm 3',
    '3.3 W',
    '480 W',
    '0.55 N',
    '13 000 Hz',
    '+79',
    '0.750',
    '190 min',
  ])('reads %s as a quantity', (text) => {
    expect(isQuantityOption(text)).toBe(true)
  })

  it.each([
    // Contains digits, but they are part of a sentence.
    ['a conversion instruction', 'Add 273 to the temperature in  C.'],
    ['a list of item numbers', '1 and 3'],
    ['a described quantity', 'a frequency of 190 Hz and a wavelength of 450 m'],
    // No digits at all.
    ['a named object', 'pencil'],
    ['a comparison row', 'both objects have the same mass'],
    ['an energy store', 'kinetic energy store of bicycle'],
    ['empty text', '   '],
  ])('does not read %s as a quantity', (_label, text) => {
    expect(isQuantityOption(text)).toBe(false)
  })

  it('tolerates the whitespace PDF extraction leaves behind', () => {
    expect(isQuantityOption('  0.80   g / cm 3  ')).toBe(true)
  })
})

describe('hasQuantitativeOptions', () => {
  const quantities = [
    { label: 'A', text: '19 mm' },
    { label: 'B', text: '29 mm' },
    { label: 'C', text: '19 cm' },
    { label: 'D', text: '29 cm' },
  ]

  it('is true when every option is a quantity', () => {
    expect(hasQuantitativeOptions(quantities)).toBe(true)
  })

  it('is false when one option is descriptive', () => {
    // A mixed list is a comparison, not a calculation — the candidate
    // did not have to produce a number to choose.
    const mixed = [
      ...quantities.slice(0, 3),
      { label: 'D', text: 'the length cannot be measured' },
    ]

    expect(hasQuantitativeOptions(mixed)).toBe(false)
  })

  it('is false for a question with no options at all', () => {
    expect(hasQuantitativeOptions([])).toBe(false)
  })
})
