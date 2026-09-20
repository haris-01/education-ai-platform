import type { TextElement } from '../types/text-element'

/**
 * Bins text elements into a table's (row, column) cells by each element's
 * center point against the table's own gridline positions, then joins the
 * text found in each cell in reading order (top-to-bottom, left-to-right).
 * A cell with no matching text becomes `""` — most tables have short
 * blank cells (e.g. an unused mark-scheme row), and that's a real absence
 * of text, not a parsing failure.
 */
export function extractTableCellText(
  rowBoundaries: number[],
  columnBoundaries: number[],
  pageNumber: number,
  textElements: TextElement[]
): string[][] {
  const relevant = textElements.filter(
    (element) => element.pageNumber === pageNumber && element.text.trim() !== ''
  )

  const byCell = relevant.reduce((map, element) => {
    const row = bucketIndex(rowBoundaries, verticalCenter(element))
    const column = bucketIndex(columnBoundaries, horizontalCenter(element))
    if (row === null || column === null) {
      return map
    }
    const key = `${row}-${column}`
    return map.set(key, [...(map.get(key) ?? []), element])
  }, new Map<string, TextElement[]>())

  const rowCount = rowBoundaries.length - 1
  const columnCount = columnBoundaries.length - 1

  return Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) =>
      joinCellText(byCell.get(`${row}-${column}`) ?? [])
    )
  )
}

function verticalCenter(element: TextElement): number {
  return element.boundingBox.y + element.boundingBox.height / 2
}

function horizontalCenter(element: TextElement): number {
  return element.boundingBox.x + element.boundingBox.width / 2
}

// `boundaries` are the ascending gridline positions; cell `i` spans
// [boundaries[i], boundaries[i + 1]). Returns null for a position outside
// the table entirely (text can legitimately sit just outside a table's
// bounding box, e.g. a caption).
function bucketIndex(boundaries: number[], position: number): number | null {
  const index = boundaries.findIndex(
    (boundary, i) =>
      i < boundaries.length - 1 &&
      position >= boundary &&
      position < boundaries[i + 1]
  )
  return index === -1 ? null : index
}

function joinCellText(elements: TextElement[]): string {
  const sorted = [...elements].sort((a, b) =>
    a.boundingBox.y === b.boundingBox.y
      ? a.boundingBox.x - b.boundingBox.x
      : a.boundingBox.y - b.boundingBox.y
  )
  return sorted
    .map((element) => element.text.trim())
    .filter((text) => text !== '')
    .join(' ')
}
