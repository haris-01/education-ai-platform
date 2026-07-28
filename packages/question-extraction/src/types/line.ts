import type { BoundingBox, TextElement } from '@education-ai/document-ai'

// A reconstructed row of text in reading order — the unit question-number
// and mark-count detection will pattern-match against, since neither can
// be recognized from isolated, unordered text runs.
export interface Line {
  pageNumber: number

  text: string

  boundingBox: BoundingBox

  // Source runs, left-to-right, kept for callers that need per-run
  // position/style (e.g. detecting a bold leading question number).
  textElements: TextElement[]
}
