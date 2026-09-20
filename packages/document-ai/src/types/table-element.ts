import type { PageElement } from './page-element'

export interface TableElement extends PageElement {
  rows: number

  columns: number

  // Ascending viewport-pixel positions of the row/column gridlines this
  // table was detected from — length `rows + 1` / `columns + 1`. Exposed
  // so cell text can be binned against the table's own structure instead
  // of re-deriving it from the raw drawing operators.
  rowBoundaries: number[]

  columnBoundaries: number[]

  // cells[row][column] — the text found inside that cell, "" if none.
  cells: string[][]
}
