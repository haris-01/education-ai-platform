import type { DrawingElement } from './drawing-element'
import type { ImageElement } from './image-element'
import type { TableElement } from './table-element'
import type { TextElement } from './text-element'

export interface Page {
  pageNumber: number

  width: number

  height: number

  textElements: TextElement[]

  imageElements: ImageElement[]

  drawingElements: DrawingElement[]

  tableElements: TableElement[]
}
