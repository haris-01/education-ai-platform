import type { QuestionOption } from '@education-ai/question-extraction'

// Units of three or more letters that appear in 0625 answer options.
// Anything else of that length is an English word, which means the option
// is describing something rather than stating a quantity.
const MULTI_LETTER_UNITS = new Set([
  'min',
  'kpa',
  'mpa',
  'kwh',
  'rad',
  'mol',
  'atm',
  'ghz',
  'khz',
  'mhz',
  'deg',
])

const WORD_PATTERN = /[A-Za-z]{3,}/g

/**
 * True when an option states a quantity ("19 mm", "0.80 g / cm3") rather
 * than describing something ("both objects have the same mass").
 *
 * The test is "contains a digit, and every word of three or more letters
 * is a unit", which is deliberately conservative in one direction: one
 * ordinary word is enough to reject the option. That keeps prose which
 * merely mentions a number ("Add 273 to the temperature in °C", "1 and
 * 3") out, at the cost of missing quantities wrapped in a sentence ("a
 * frequency of 190 × 10¹² Hz"). Under-detecting leaves an honest gap;
 * over-detecting would put a confident wrong objective on the question.
 */
export function isQuantityOption(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned === '' || !/\d/.test(cleaned)) {
    return false
  }

  const words = cleaned.match(WORD_PATTERN) ?? []
  return words.every((word) => MULTI_LETTER_UNITS.has(word.toLowerCase()))
}

/**
 * True when every option is a quantity, meaning the candidate had to
 * produce a number to choose between them. A single descriptive option is
 * enough to fail this — a mixed list is a comparison, not a calculation.
 */
export function hasQuantitativeOptions(options: QuestionOption[]): boolean {
  if (options.length === 0) {
    return false
  }

  return options.every((option) => isQuantityOption(option.text))
}
