import type { Page } from '../types/page'

export interface ColumnBounds {
  // Inclusive left edge. Omit for "from the left edge of the page".
  minX?: number

  // Exclusive right edge. Omit for "to the right edge of the page".
  maxX?: number
}

/**
 * Narrows a page to the text that falls inside one column.
 *
 * Line reconstruction joins everything sharing a vertical position, which
 * is right for a single-column page and wrong for a two-column one: in the
 * Cambridge syllabus's subject-content tables, a Core objective and an
 * unrelated Supplement objective sit at the same height and get glued into
 * one nonsense line ("3 Recall and use the equation 9 Define acceleration
 * as change in velocity per unit"). Slicing the page by x first, then
 * reconstructing lines within each slice, keeps the two columns apart.
 *
 * Only text is sliced. Images, drawings and tables are dropped rather than
 * filtered, because a column slice is an intermediate for reading text in
 * order — a caller that wants those should work from the original page,
 * where their positions are still meaningful.
 */
export function slicePageColumn(page: Page, bounds: ColumnBounds): Page {
  const { minX = -Infinity, maxX = Infinity } = bounds

  return {
    ...page,
    textElements: page.textElements.filter(
      (element) => element.boundingBox.x >= minX && element.boundingBox.x < maxX
    ),
    imageElements: [],
    drawingElements: [],
    tableElements: [],
  }
}
