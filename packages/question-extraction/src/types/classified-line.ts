import type { Line } from './line'

export type LineRole =
  | 'questionNumber'
  | 'subpart'
  | 'subSubpart'
  | 'body'
  | 'boilerplate'

// The structural role of a reconstructed line, plus any mark counts found
// on it. Marks are pulled out separately from `role` because a mark count
// can trail almost any line ("acceleration = .......... [3]"), not just
// lines that are otherwise unstructured body text.
export interface ClassifiedLine {
  line: Line

  role: LineRole

  // The line's text with every leading structural token stripped (question
  // number, sub-part label, sub-sub-part label — however many apply) and
  // any trailing "[3]" / "[Total: 8]" bracket stripped too (those numbers
  // already live in `marks`/`totalMarks` below). This is the text that
  // actually belongs to the deepest entity this line starts, e.g.
  // "2 (a) Complete the definitions... [2]" -> "Complete the
  // definitions...". Equal to the full line text (minus any bracket) when
  // role === 'body'.
  content: string

  // Present when role === 'questionNumber'.
  questionNumber?: number

  // Present when role === 'subpart' | 'subSubpart' (the line's own label,
  // e.g. "a" or "i"), or when role === 'questionNumber' and the first
  // sub-part starts on the same line, e.g. "2 (a) Complete the
  // definitions...".
  partLabel?: string

  // A sub-sub-part label that sits on the same line as its parent
  // sub-part or question, e.g. "(a) (i) State the name..." or
  // "2 (a) (i) ...". Never set when role === 'subSubpart' — that line's
  // own label is `partLabel`, not this.
  nestedPartLabel?: string

  // Trailing "[3]" on this line, if any.
  marks?: number

  // Trailing "[Total: 8]" on this line, if any.
  totalMarks?: number

  // Present when role === 'body' and the line matches a bare "A ...",
  // "B ...", "C ...", or "D ..." pattern — a *candidate* multiple-choice
  // option, e.g. "A Both runners are moving at the same speed." This is
  // only a pattern match, not a confirmed option: at this indent a real
  // sentence can just as easily start with "A uniform rod..." Assembly
  // confirms it by requiring A/B/C/D to show up in strict sequence right
  // after a question with no sub-parts — position and pattern alone can't
  // tell the two apart.
  optionLabel?: string
}
