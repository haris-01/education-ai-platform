import type { Page, ParsedDocument, TextElement } from '@education-ai/document-ai'

let nextElementId = 0

export function textElement(
  pageNumber: number,
  text: string,
  x: number,
  y: number
): TextElement {
  nextElementId += 1
  return {
    id: `text-${nextElementId}`,
    pageNumber,
    text,
    boundingBox: { x, y, width: text.length * 6, height: 11 },
  }
}

export function page(pageNumber: number, textElements: TextElement[]): Page {
  return {
    pageNumber,
    width: 595,
    height: 842,
    textElements,
    imageElements: [],
    drawingElements: [],
    tableElements: [],
  }
}

export function parsedDocument(pages: Page[]): ParsedDocument {
  return {
    metadata: {
      resourceId: 'test-mark-scheme',
      title: 'test-mark-scheme',
      pageCount: pages.length,
      parsedAt: new Date('2024-01-01T00:00:00Z'),
      parserVersion: 'test',
    },
    pages,
  }
}
