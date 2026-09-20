/**
 * Combines a paper number and optional variant into the short code exam
 * boards print on their own papers (e.g. paper 4 variant 1 -> "41").
 * Falls back to just the paper number when there's no variant (e.g.
 * specimen papers, which aren't split by administrative zone).
 */
export function paperCode(paper: number, variant?: number): string {
  return variant !== undefined ? `${paper}${variant}` : String(paper)
}

// Which paper of a syllabus a document belongs to, as the board prints it
// on the document itself.
export interface PaperIdentity {
  // "0625" — the syllabus, not the paper.
  syllabusCode: string

  // "41" — paper and variant together, the form examiner reports use to
  // label their sections and `datasets/` uses for its directories.
  code: string

  // 4
  number: number

  // 1. Undefined for specimen papers, which print "0625/4" with no
  // variant because they aren't split by administrative zone.
  variant?: number
}

// The forms Cambridge actually prints:
//
//   0625/41         past paper, front page      -> paper 4, variant 1
//   0625/41/M/J/24  past paper, page footer     -> same
//   0625/05         specimen, front page        -> paper 5, no variant
//   0625/05/SP/23   specimen, page footer       -> same
//
// A specimen paper is padded to two digits with a leading zero rather
// than printed bare, so the second digit is only a variant when the first
// one isn't "0". The session suffix is matched purely so it can be
// discarded — the session is already carried by the dataset path, and
// repeating it here would create a second source of truth for one fact.
// Both session shapes appear: "M/J/24" (May/June) and "SP/23" (specimen).
const PAPER_CODE_PATTERN =
  /^(\d{4})\/(\d)(\d)?(?:\/(?:[A-Z]\/[A-Z]|[A-Z]{2})\/\d{2})?$/

/**
 * Parses a printed paper code ("0625/41") into its parts, or returns
 * `undefined` when the value isn't one. Returning `undefined` rather than
 * throwing lets callers run this straight over every text element on a
 * page and keep the hits, with no pre-filtering.
 */
export function parsePaperCode(value: string): PaperIdentity | undefined {
  const match = PAPER_CODE_PATTERN.exec(value.trim())
  if (!match) {
    return undefined
  }

  const [, syllabusCode, firstDigit, secondDigit] = match
  const isPadded = firstDigit === '0'

  if (isPadded && secondDigit === undefined) {
    return undefined
  }

  const number = Number(isPadded ? secondDigit : firstDigit)
  const variant =
    !isPadded && secondDigit !== undefined ? Number(secondDigit) : undefined

  return {
    syllabusCode,
    // Built with `paperCode` rather than echoed from the source text, so
    // "0625/05" and "0625/5" both normalise to "5" and the two functions
    // can't drift apart.
    code: paperCode(number, variant),
    number,
    variant,
  }
}
