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

// A multiple-choice option, e.g. { label: "A", text: "Both runners are
// moving at the same speed." }. Which option is correct isn't in the
// question paper — that lives in the mark scheme, a separate document not
// parsed here.
export interface QuestionOption {
  label: string

  text: string
}

export interface Question extends ElementRefs {
  number: number

  text: string

  marks?: number

  pageNumbers: number[]

  parts: QuestionPart[]

  // Populated only for multiple-choice questions (empty otherwise).
  options: QuestionOption[]
}
