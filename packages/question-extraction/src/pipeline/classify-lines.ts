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
// Candidate multiple-choice option, e.g. "A Both runners are moving at the
// same speed." Only a pattern match — see `optionLabel` on `ClassifiedLine`
// for why this can't be confirmed here.
const OPTION_PATTERN = /^([A-D])\s+(.+)$/
// Some short-answer MCQ items pack all four options onto one physical
// line instead of one per line, e.g. "A 2.2 cm B 2.6 cm C 13.2 cm D 15.6
// cm" — confirmed against real 0625 paper 1 questions. Anchored end to
// end so it only matches when all four labels appear in strict order.
const INLINE_OPTIONS_PATTERN =
  /^A\s+(.*?)\s+B\s+(.*?)\s+C\s+(.*?)\s+D\s+(.*)$/

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
 * Pass every line in the document, not one page at a time — the left
 * margin needs enough samples across the whole document to be reliable,
 * for two reasons confirmed against real papers: a single page can have a
 * diagram label poking left of the true margin (see
 * `computeLeftMargin`'s MIN_MARGIN_OCCURRENCES), and body-text indents
 * (e.g. "(i)"-nested continuation lines) can simply be more numerous than
 * question-number lines, which would make a same-page "most common x"
 * estimate land on the wrong indent level entirely.
 *
 * Usually one `Line` produces one `ClassifiedLine`, but a line packing all
 * four MCQ options together produces four (see `INLINE_OPTIONS_PATTERN`),
 * so this is a `flatMap`, not a `map`.
 */
export function classifyLines(lines: Line[]): ClassifiedLine[] {
  if (lines.length === 0) {
    return []
  }

  const leftMargin = computeLeftMargin(lines)

  return lines.flatMap((line) => classifyLine(line, leftMargin))
}

// A one-off diagram label poking left of the margin should never win —
// this is the minimum number of lines that must share an x-bucket before
// it's treated as a real structural indent level, not noise.
const MIN_MARGIN_OCCURRENCES = 3

// The margin is the *smallest* x that recurs often enough to be
// structural — not the most common x. The most common x is usually the
// document's dominant body-text indent (e.g. sub-part continuation
// lines), which sits to the right of the true margin, not at it; picking
// it as "the margin" doesn't just fail to reject deeper indents, it can
// actively misread a numbered answer-blank list ("1 ....", "2 ....") at
// that same indent as new question numbers — confirmed against a real
// paper where this produced a bogus question-number restart mid-document.
function computeLeftMargin(lines: Line[]): number {
  const counts = lines.reduce<Record<number, number>>((acc, line) => {
    const bucket = Math.round(line.boundingBox.x)
    return { ...acc, [bucket]: (acc[bucket] ?? 0) + 1 }
  }, {})

  const structuralBuckets = Object.entries(counts)
    .filter(([, count]) => count >= MIN_MARGIN_OCCURRENCES)
    .map(([bucket]) => Number(bucket))

  if (structuralBuckets.length === 0) {
    return Math.min(...lines.map((line) => line.boundingBox.x))
  }
  return Math.min(...structuralBuckets)
}

function classifyLine(line: Line, leftMargin: number): ClassifiedLine[] {
  const text = line.text.trim()
  const marks = extractMatch(text, MARKS_PATTERN)
  const totalMarks = extractMatch(text, TOTAL_MARKS_PATTERN)

  if (isBoilerplate(text, line)) {
    return [buildClassifiedLine(line, 'boilerplate', marks, totalMarks, text, {})]
  }

  const subpartMatch = text.match(SUBPART_PATTERN)
  if (subpartMatch) {
    const afterSubpart = subpartMatch[2].trim()
    const subSubpartMatch = afterSubpart.match(SUB_SUBPART_PATTERN)
    return [
      buildClassifiedLine(
        line,
        'subpart',
        marks,
        totalMarks,
        subSubpartMatch ? subSubpartMatch[2].trim() : afterSubpart,
        {
          partLabel: subpartMatch[1],
          nestedPartLabel: subSubpartMatch?.[1],
        }
      ),
    ]
  }

  const subSubpartMatch = text.match(SUB_SUBPART_PATTERN)
  if (subSubpartMatch) {
    return [
      buildClassifiedLine(
        line,
        'subSubpart',
        marks,
        totalMarks,
        subSubpartMatch[2].trim(),
        { partLabel: subSubpartMatch[1] }
      ),
    ]
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

    return [
      buildClassifiedLine(
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
      ),
    ]
  }

  const inlineOptions = text.match(INLINE_OPTIONS_PATTERN)
  if (inlineOptions) {
    const [, a, b, c, d] = inlineOptions
    return (['A', 'B', 'C', 'D'] as const).map((label, index) =>
      buildClassifiedLine(
        line,
        'body',
        undefined,
        undefined,
        [a, b, c, d][index].trim(),
        { optionLabel: label }
      )
    )
  }

  const optionMatch = text.match(OPTION_PATTERN)
  if (optionMatch) {
    return [
      buildClassifiedLine(line, 'body', marks, totalMarks, optionMatch[2].trim(), {
        optionLabel: optionMatch[1],
      }),
    ]
  }

  return [buildClassifiedLine(line, 'body', marks, totalMarks, text, {})]
}

function buildClassifiedLine(
  line: Line,
  role: LineRole,
  marks: number | undefined,
  totalMarks: number | undefined,
  content: string,
  fields: Pick<
    ClassifiedLine,
    'questionNumber' | 'partLabel' | 'nestedPartLabel' | 'optionLabel'
  >
): ClassifiedLine {
  return {
    line,
    role,
    marks,
    totalMarks,
    // marks/totalMarks are already pulled out as numbers above — stripping
    // the bracket text itself here too means downstream `text` fields
    // (Question/QuestionPart/QuestionSubPart) read as clean prose instead
    // of ending in a literal "[3]" or "[Total: 8]".
    content: stripTrailingMarksBracket(content),
    ...fields,
  }
}

function stripTrailingMarksBracket(content: string): string {
  return content.replace(TOTAL_MARKS_PATTERN, '').replace(MARKS_PATTERN, '').trim()
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
