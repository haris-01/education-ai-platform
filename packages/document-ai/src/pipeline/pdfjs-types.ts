import type { PDFPageProxy } from 'pdfjs-dist'

// pdfjs-dist doesn't export `TextContent`/`TextItem`/`PageViewport`/
// `OperatorList` from its public entry point, so these are derived from the
// methods that produce them instead of reaching into its internal module
// paths.
export type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>
export type TextContentItem = TextContent['items'][number]
export type TextItem = Extract<TextContentItem, { str: string }>
export type PageViewport = ReturnType<PDFPageProxy['getViewport']>
export type OperatorList = Awaited<ReturnType<PDFPageProxy['getOperatorList']>>
