import type { CandidateOutcome } from '../types/question-difficulty'

// Roughly what share of candidates a quantifier describes. Counted across
// the whole June 2024 report to make sure these are the phrases examiners
// actually reach for, not ones that merely sound plausible: "most
// candidates" appears 137 times, "many candidates" 154, "some candidates"
// 66, "only stronger candidates" 20, "almost all candidates" 8.
//
// Ordered longest-first so "the vast majority of candidates" is matched
// before "the majority of candidates", and "a few candidates" before
// "few candidates" — a shorter phrase that is a suffix of a longer one
// would otherwise win and lose the distinction.
export type CandidateShare = 'most' | 'many' | 'few'

export interface QuantifierPhrase {
  phrase: string
  share: CandidateShare
}

export const QUANTIFIER_PHRASES: QuantifierPhrase[] = [
  // Cohort-qualified quantifiers. "Most stronger candidates chose the
  // correct option" is a statement about the strong cohort only, so it
  // describes a question most candidates did NOT get — the share that
  // matters is the share of all candidates, which is small.
  { phrase: 'the majority of stronger candidates', share: 'few' },
  { phrase: 'most stronger candidates', share: 'few' },
  { phrase: 'many stronger candidates', share: 'few' },
  { phrase: 'only the strongest candidates', share: 'few' },
  { phrase: 'only stronger candidates', share: 'few' },
  { phrase: 'the strongest candidates', share: 'few' },

  // "Many weaker candidates incorrectly believed ..." — a failure by a
  // sizeable group, which reads as a hard question via the table below.
  { phrase: 'many weaker candidates', share: 'many' },
  { phrase: 'some weaker candidates', share: 'many' },
  { phrase: 'most weaker candidates', share: 'most' },

  { phrase: 'the vast majority of candidates', share: 'most' },
  { phrase: 'the majority of candidates', share: 'most' },
  { phrase: 'almost all candidates', share: 'most' },
  { phrase: 'nearly all candidates', share: 'most' },
  { phrase: 'a high proportion of candidates', share: 'most' },
  { phrase: 'a significant number of candidates', share: 'many' },
  { phrase: 'a small number of candidates', share: 'few' },
  { phrase: 'a minority of candidates', share: 'few' },
  { phrase: 'most candidates', share: 'most' },
  { phrase: 'many candidates', share: 'many' },
  { phrase: 'some candidates', share: 'many' },
  { phrase: 'a few candidates', share: 'few' },
  { phrase: 'few candidates', share: 'few' },
]

// Phrases that state difficulty outright, with no quantifier to pair with
// an outcome. These carry more weight than an inferred band, because the
// examiner is reporting the conclusion rather than the raw behaviour —
// "Candidates found this question challenging" needs no interpretation.
//
// They matter most on multiple-choice papers, where the commentary is
// written as a verdict on the item rather than a walk through sub-parts.
export interface DirectDifficultyMarker {
  pattern: RegExp
  band: 'low' | 'high'
}

export const DIRECT_DIFFICULTY_MARKERS: DirectDifficultyMarker[] = [
  {
    pattern: /\bfound (this|the) question (very )?challenging\b/i,
    band: 'high',
  },
  { pattern: /\bfound (this|the) question difficult\b/i, band: 'high' },
  { pattern: /\bproved (very )?challenging\b/i, band: 'high' },
  { pattern: /\bstruggled to\b/i, band: 'high' },
  { pattern: /\bdemonstrated poor knowledge\b/i, band: 'high' },
  { pattern: /\bevidence of guesswork\b/i, band: 'high' },
  { pattern: /\b(were|was) not well understood\b/i, band: 'high' },
  { pattern: /\bpoorly answered\b/i, band: 'high' },
  { pattern: /\bdemonstrated (very )?good knowledge\b/i, band: 'low' },
  { pattern: /\bdemonstrated an excellent understanding\b/i, band: 'low' },
  { pattern: /\b(was|were) well answered\b/i, band: 'low' },
  { pattern: /\banswered confidently\b/i, band: 'low' },
]

/**
 * A band stated outright by the examiner, if the sentence states one.
 * Checked before the quantifier rules, since it needs no inference.
 */
export function findDirectDifficulty(
  sentence: string
): 'low' | 'high' | undefined {
  return DIRECT_DIFFICULTY_MARKERS.find((marker) =>
    marker.pattern.test(sentence)
  )?.band
}

// Words that say candidates got it right. "Credit" is included because
// examiners use it constantly — "gained credit", "to earn full credit".
const SUCCESS_MARKERS = [
  /\bcorrect(ly)?\b/i,
  /\bgained? (partial |full )?credit\b/i,
  /\bearn(ed|s)? (partial |full )?credit\b/i,
  /\bunderstood\b/i,
  /\bwell answered\b/i,
  /\bsuccessful(ly)?\b/i,
  /\bable to\b/i,
]

// Checked before the success markers, because a failure sentence very
// often contains a success word it is negating — "did not give the
// correct unit" holds "correct" but describes a failure.
const FAILURE_MARKERS = [
  /\bdid not\b/i,
  /\bdo not\b/i,
  /\bincorrect(ly)?\b/i,
  /\bfailed to\b/i,
  /\bunable to\b/i,
  /\bstruggled\b/i,
  /\bno credit\b/i,
  /\bcould not\b/i,
  /\bwere unable\b/i,
  /\ba common (error|mistake|misunderstanding|misconception)\b/i,
  /\bomitted\b/i,
  /\bmisread\b/i,
]

/**
 * Finds the quantifier a sentence uses about candidates, if any. Returns
 * the longest match, so "the vast majority of candidates" is not reported
 * as the "the majority of candidates" it contains.
 */
export function findQuantifier(sentence: string): QuantifierPhrase | undefined {
  const lower = sentence.toLowerCase()
  return QUANTIFIER_PHRASES.find((entry) => lower.includes(entry.phrase))
}

/**
 * Whether a sentence describes candidates succeeding or failing.
 *
 * Failure is tested first and wins ties: a sentence that mixes both
 * ("almost all candidates gave a region of the spectrum but many of these
 * did not give one with longer wavelengths") is reporting a shortfall,
 * and reading it as a success would make a hard question look easy.
 */
export function findOutcome(sentence: string): CandidateOutcome | undefined {
  if (FAILURE_MARKERS.some((marker) => marker.test(sentence))) {
    return 'failure'
  }

  if (SUCCESS_MARKERS.some((marker) => marker.test(sentence))) {
    return 'success'
  }

  return undefined
}
