import type { ExamSession } from '../../cambridge/types.js'

/**
 * Shape of one `pageProps.pastPapers[]` entry from savemyexams'
 * `__NEXT_DATA__` blob. Only the fields this pipeline actually reads are
 * declared — the real payload has many more (timestamps, description,
 * minutes, etc.) that aren't relevant here.
 */
export interface RawPastPaper {
  attributes: {
    year: number | null
    month: number | null
    code: string
    is_specimen_paper: boolean
    exam_paper: string | null
    mark_scheme: string | null
  }
}

export interface ClassifiedPastPaper {
  year?: number
  session?: ExamSession
  paper: number
  variant?: number
  isSpecimen: boolean
}

const MONTH_TO_SESSION: Record<number, ExamSession> = {
  2: 'FM',
  3: 'FM',
  5: 'MJ',
  6: 'MJ',
  10: 'ON',
  11: 'ON',
}

/**
 * Turns a raw savemyexams past-paper record into the same shape of facts
 * `classifyDocument` (the Cambridge job's own title-parsing classifier)
 * produces — but read directly off structured fields instead of regexing a
 * title string, since savemyexams gives us that structure for free.
 */
export function classifyPastPaper(
  paper: RawPastPaper
): ClassifiedPastPaper {
  const { attributes } = paper
  const isSpecimen = attributes.is_specimen_paper
  const { paper: paperNumber, variant } = parsePaperCode(
    attributes.code,
    isSpecimen
  )

  return {
    year: attributes.year ?? extractYearFromUrl(attributes),
    session:
      attributes.month !== null
        ? MONTH_TO_SESSION[attributes.month]
        : undefined,
    paper: paperNumber,
    variant,
    isSpecimen,
  }
}

/**
 * Splits a `code` field (e.g. "0972/11" -> paper 1, variant 1) into paper
 * number and variant. Specimen papers use a zero-padded single digit with no
 * variant (e.g. "0972/01" -> paper 1, no variant) since they aren't split by
 * administrative zone.
 */
function parsePaperCode(
  code: string,
  isSpecimen: boolean
): { paper: number; variant?: number } {
  const digits = code.split('/')[1] ?? ''

  if (isSpecimen) {
    return { paper: Number(digits) }
  }

  return {
    paper: Number(digits[0]),
    variant: digits.length > 1 ? Number(digits[1]) : undefined,
  }
}

/**
 * Specimen papers have `year: null` in the JSON — fall back to the year
 * embedded in the PDF filename (e.g. ".../595934-2023-specimen-paper-1.pdf"),
 * the same technique the Cambridge job's own `extractYear` uses on titles.
 */
function extractYearFromUrl(
  attributes: RawPastPaper['attributes']
): number | undefined {
  const url = attributes.exam_paper ?? attributes.mark_scheme ?? ''
  const match = url.match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : undefined
}
