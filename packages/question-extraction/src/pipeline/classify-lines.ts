import type { ClassifiedLine, LineRole } from '../types/classified-line'
import type { Line } from '../types/line'

// A line counts as sitting at the content left margin if it starts within
// this many px of the margin. Distinguishes a real question number
// ("4 Two runners...") from a measurement or label that happens to start
// with a digit ("30 cm 70 cm") but sits indented inside a diagram.
const MARGIN_TOLERANCE_PX = 5

const QUESTION_NUMBER_PATTERN = /^(\d{1,2})\s+(.+)$/
// Excludes i/v/x: Cambridge sub-parts never reach those letters in
// practice, and reserving them avoids "(i)" being read as sub-part "i"
// instead of sub-sub-part roman numeral "i" (checked below).
const SUBPART_PATTERN = /^\(([a-hj-uwy-z])\)\s*(.*)$/
const SUB_SUBPART_PATTERN = /^\(([ivx]+)\)\s*(.*)$/
const TOTAL_MARKS_PATTERN = /\[\s*Total:\s*(\d+)\s*\]\s*$/i
// Requires only whitespace between the brackets and the digits, so this
// never matches a "[Total: N]" line — no need to check the two patterns
// against different substrings.
const MARKS_PATTERN = /\[\s*(\d+)\s*\]\s*$/

// Page furniture that carries no question content: copyright footers
// ("© UCLES 2020 ... [Turn over"), "BLANK PAGE" markers, and the bare page
// number printed at the top of every page. Left classified (not dropped
// from the line list — they still count toward the left-margin estimate)
// but excluded from assembly so they don't get glued onto whatever
// question part happened to be open when the page ended.
const COPYRIGHT_PATTERN = /^©/
const BLANK_PAGE_PATTERN = /^BLANK\s+PAGE$/i
const PAGE_NUMBER_ONLY_PATTERN = /^\d{1,4}$/
// Real page-header numbers sit around y=36; real body content starts
// around y=62+ — see playground/probe-lines.ts output. A bare number
// elsewhere on the page (e.g. a graph axis label) is real content, not a
// header, so this check is position-gated rather than a blanket digits-only
// match.
const PAGE_HEADER_MAX_Y = 60

/**
 * Classifies every line: is it a question number, a sub-part label, a
 * sub-sub-part label, or plain body text — and does it carry a mark count.
 * Derived from patterns observed across real Cambridge 0625 papers (see
 * playground/probe-lines.ts output), not guessed blind.
 *
 * Pass every line in the document, not one page at a time. The left
 * margin is derived from the most common line-start x across whatever is
 * passed in, and a single page can have too few margin-aligned lines (or
 * a diagram label poking further left than the real margin) to make that
 * estimate reliable — confirmed against a real paper where a lens diagram
 * label sitting 3px left of the margin caused a whole question to be
 * silently swallowed into the previous one.
 */
export function classifyLines(lines: Line[]): ClassifiedLine[] {
  if (lines.length === 0) {
    return []
  }

  const leftMargin = computeLeftMargin(lines)

  return lines.map((line) => classifyLine(line, leftMargin))
}

function computeLeftMargin(lines: Line[]): number {
  const counts = lines.reduce<Record<number, number>>((acc, line) => {
    const bucket = Math.round(line.boundingBox.x)
    return { ...acc, [bucket]: (acc[bucket] ?? 0) + 1 }
  }, {})

  const [mode] = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]
  return Number(mode)
}

function classifyLine(line: Line, leftMargin: number): ClassifiedLine {
  const text = line.text.trim()
  const marks = extractMatch(text, MARKS_PATTERN)
  const totalMarks = extractMatch(text, TOTAL_MARKS_PATTERN)

  if (isBoilerplate(text, line)) {
    return buildClassifiedLine(line, 'boilerplate', marks, totalMarks, text, {})
  }

  const subpartMatch = text.match(SUBPART_PATTERN)
  if (subpartMatch) {
    const afterSubpart = subpartMatch[2].trim()
    const subSubpartMatch = afterSubpart.match(SUB_SUBPART_PATTERN)
    return buildClassifiedLine(
      line,
      'subpart',
      marks,
      totalMarks,
      subSubpartMatch ? subSubpartMatch[2].trim() : afterSubpart,
      {
        partLabel: subpartMatch[1],
        nestedPartLabel: subSubpartMatch?.[1],
      }
    )
  }

  const subSubpartMatch = text.match(SUB_SUBPART_PATTERN)
  if (subSubpartMatch) {
    return buildClassifiedLine(
      line,
      'subSubpart',
      marks,
      totalMarks,
      subSubpartMatch[2].trim(),
      { partLabel: subSubpartMatch[1] }
    )
  }

  const questionMatch = text.match(QUESTION_NUMBER_PATTERN)
  const isNearMargin = line.boundingBox.x <= leftMargin + MARGIN_TOLERANCE_PX
  if (questionMatch && isNearMargin) {
    const afterQuestion = questionMatch[2].trim()
    const embeddedSubpartMatch = afterQuestion.match(SUBPART_PATTERN)
    const afterEmbeddedSubpart = embeddedSubpartMatch?.[2].trim()
    const embeddedSubSubpartMatch = afterEmbeddedSubpart?.match(
      SUB_SUBPART_PATTERN
    )
    const content =
      embeddedSubSubpartMatch?.[2].trim() ??
      afterEmbeddedSubpart ??
      afterQuestion

    return buildClassifiedLine(
      line,
      'questionNumber',
      marks,
      totalMarks,
      content,
      {
        questionNumber: Number(questionMatch[1]),
        partLabel: embeddedSubpartMatch?.[1],
        nestedPartLabel: embeddedSubSubpartMatch?.[1],
      }
    )
  }

  return buildClassifiedLine(line, 'body', marks, totalMarks, text, {})
}

function buildClassifiedLine(
  line: Line,
  role: LineRole,
  marks: number | undefined,
  totalMarks: number | undefined,
  content: string,
  fields: Pick<
    ClassifiedLine,
    'questionNumber' | 'partLabel' | 'nestedPartLabel'
  >
): ClassifiedLine {
  return {
    line,
    role,
    marks,
    totalMarks,
    content,
    ...fields,
  }
}

function isBoilerplate(text: string, line: Line): boolean {
  if (COPYRIGHT_PATTERN.test(text) || BLANK_PAGE_PATTERN.test(text)) {
    return true
  }
  return (
    PAGE_NUMBER_ONLY_PATTERN.test(text) &&
    line.boundingBox.y < PAGE_HEADER_MAX_Y
  )
}

function extractMatch(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern)
  return match ? Number(match[1]) : undefined
}
