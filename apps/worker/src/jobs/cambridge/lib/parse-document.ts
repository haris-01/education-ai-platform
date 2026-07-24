import type { DocumentType, ExamSession } from '../types.js'

/**
 * Cambridge document titles follow a small set of consistent patterns, e.g.
 * "June 2024 Question Paper 11", "2023 Specimen Paper 1 Mark Scheme",
 * "2023-2025 Syllabus". Parsing the visible title text is more robust than
 * relying on DOM nesting (year/session headings), which varies between the
 * past papers, examiner reports and specimen paper listings.
 */

const MONTH_TO_SESSION: Array<{ match: RegExp; session: ExamSession }> = [
  { match: /march|february/i, session: 'FM' },
  { match: /june|may/i, session: 'MJ' },
  { match: /november|october/i, session: 'ON' },
]

export interface DocumentClassification {
  type: DocumentType
  year?: number
  session?: ExamSession
  paper?: number
  variant?: number
}

export function classifyDocument(title: string): DocumentClassification {
  return {
    type: classifyType(title),
    year: extractYear(title),
    session: extractSession(title),
    ...extractPaperAndVariant(title),
  }
}

function classifyType(title: string): DocumentType {
  if (/mark scheme/i.test(title)) {
    return 'MARK_SCHEME'
  }
  if (/examiner report/i.test(title)) {
    return 'EXAMINER_REPORT'
  }
  if (/confidential instructions/i.test(title)) {
    return 'CONFIDENTIAL_INSTRUCTIONS'
  }
  if (/specimen/i.test(title)) {
    return 'SPECIMEN_PAPER'
  }
  if (/question paper/i.test(title)) {
    return 'QUESTION_PAPER'
  }
  if (/syllabus/i.test(title)) {
    return 'SYLLABUS'
  }
  return 'OTHER'
}

function extractYear(title: string): number | undefined {
  const match = title.match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : undefined
}

function extractSession(title: string): ExamSession | undefined {
  return MONTH_TO_SESSION.find(({ match }) => match.test(title))?.session
}

function extractPaperAndVariant(title: string): {
  paper?: number
  variant?: number
} {
  const match = title.match(/paper\s+(\d)(\d)?\b/i)
  if (!match) {
    return {}
  }

  return {
    paper: Number(match[1]),
    variant: match[2] ? Number(match[2]) : undefined,
  }
}
