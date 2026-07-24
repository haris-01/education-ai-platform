import type { BoundingBox } from './bounding-box'

export interface PageElement {
  id: string

  pageNumber: number

  boundingBox: BoundingBox
}
