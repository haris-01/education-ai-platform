import type {
  GeneratedPaper,
  OriginalityReport,
  ValidationReport,
} from '@education-ai/exam-generation'

export interface StoredPaper {
  id: string

  paper: GeneratedPaper

  validation: ValidationReport

  originality: OriginalityReport

  createdAt: Date
}

export interface PaperSummary {
  id: string

  syllabusCode: string

  title: string

  totalMarks: number

  questionCount: number

  generatorModel: string

  valid: boolean

  createdAt: Date
}

export interface PaperStore {
  save(paper: StoredPaper): Promise<void>

  find(id: string): Promise<StoredPaper | undefined>

  list(syllabusCode?: string, limit?: number): Promise<PaperSummary[]>

  close(): Promise<void>
}
