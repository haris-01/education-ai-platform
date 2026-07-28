export interface QuestionSubPart {
  label: string

  text: string

  marks?: number

  pageNumbers: number[]
}

export interface QuestionPart {
  label: string

  text: string

  marks?: number

  pageNumbers: number[]

  subParts: QuestionSubPart[]
}

export interface Question {
  number: number

  text: string

  marks?: number

  pageNumbers: number[]

  parts: QuestionPart[]
}
