// Ids of `ImageElement` / `DrawingElement` / `TableElement` (from the
// source `ParsedDocument`) that fall inside this entity's region of the
// page. Kept as ids rather than embedded elements — `QuestionDocument`
// references Phase 2's output, it doesn't duplicate it.
export interface ElementRefs {
  imageRefs: string[]

  drawingRefs: string[]

  tableRefs: string[]
}

export interface QuestionSubPart extends ElementRefs {
  label: string

  text: string

  marks?: number

  pageNumbers: number[]
}

export interface QuestionPart extends ElementRefs {
  label: string

  text: string

  marks?: number

  pageNumbers: number[]

  subParts: QuestionSubPart[]
}

export interface Question extends ElementRefs {
  number: number

  text: string

  marks?: number

  pageNumbers: number[]

  parts: QuestionPart[]
}
