import type { PageElement } from './page-element'

export interface ImageElement extends PageElement {
  imagePath: string

  width: number

  height: number
}
