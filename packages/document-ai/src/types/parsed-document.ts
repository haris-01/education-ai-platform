import type { DocumentMetadata } from './document-metadata'
import type { Page } from './page'

export interface ParsedDocument {
  metadata: DocumentMetadata

  pages: Page[]
}
