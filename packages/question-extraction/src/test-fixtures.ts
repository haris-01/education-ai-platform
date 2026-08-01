import type {
  BoundingBox,
  DrawingElement,
  ImageElement,
  Page,
  ParsedDocument,
  TableElement,
  TextElement,
} from '@education-ai/document-ai'

import type { Line } from './types/line'

let nextElementId = 0

// Small helpers for building synthetic pipeline input in tests without
// parsing a real PDF — fast, and pins down exact bounding-box positions
// for the edge cases each regression test targets.

export function textElement(
  pageNumber: number,
  text: string,
  x: number,
  y: number,
  overrides: Partial<Pick<BoundingBox, 'width' | 'height'>> = {}
): TextElement {
  nextElementId += 1
  const width = overrides.width ?? text.length * 6
  const height = overrides.height ?? 11
  return {
    id: `text-${nextElementId}`,
    pageNumber,
    text,
    boundingBox: { x, y, width, height },
  }
}

export function imageElement(
  pageNumber: number,
  x: number,
  y: number
): ImageElement {
  nextElementId += 1
  return {
    id: `image-${nextElementId}`,
    pageNumber,
    boundingBox: { x, y, width: 100, height: 100 },
    imagePath: `/tmp/${nextElementId}.png`,
    width: 100,
    height: 100,
  }
}

export function drawingElement(
  pageNumber: number,
  x: number,
  y: number
): DrawingElement {
  nextElementId += 1
  return {
    id: `drawing-${nextElementId}`,
    pageNumber,
    boundingBox: { x, y, width: 100, height: 100 },
  }
}

export function tableElement(
  pageNumber: number,
  x: number,
  y: number
): TableElement {
  nextElementId += 1
  return {
    id: `table-${nextElementId}`,
    pageNumber,
    boundingBox: { x, y, width: 100, height: 50 },
    rows: 2,
    columns: 2,
  }
}

export function line(pageNumber: number, text: string, x: number, y: number): Line {
  return {
    pageNumber,
    text,
    boundingBox: { x, y, width: text.length * 6, height: 11 },
    textElements: [],
  }
}

export function page(
  pageNumber: number,
  textElements: TextElement[],
  elements: {
    imageElements?: ImageElement[]
    drawingElements?: DrawingElement[]
    tableElements?: TableElement[]
  } = {}
): Page {
  return {
    pageNumber,
    width: 595,
    height: 842,
    textElements,
    imageElements: elements.imageElements ?? [],
    drawingElements: elements.drawingElements ?? [],
    tableElements: elements.tableElements ?? [],
  }
}

export function parsedDocument(pages: Page[]): ParsedDocument {
  return {
    metadata: {
      resourceId: 'test-doc',
      title: 'test-doc',
      pageCount: pages.length,
      parsedAt: new Date('2024-01-01T00:00:00Z'),
      parserVersion: 'test',
    },
    pages,
  }
}
