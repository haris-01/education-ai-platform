import type { DocumentStatistics } from './document-statistics'
import type { DocumentType } from './document-type'

export interface DocumentAnalysis {
  type: DocumentType

  confidence: number

  statistics: DocumentStatistics
}
