import type { PageElement } from './page-element'

export interface TextElement extends PageElement {
  text: string

  fontFamily?: string

  fontSize?: number

  bold?: boolean

  italic?: boolean
}
