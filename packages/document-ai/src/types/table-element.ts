import type { PageElement } from './page-element'

export interface TableElement extends PageElement {
  rows: number

  columns: number

  // Later we'll add cell data.
}
