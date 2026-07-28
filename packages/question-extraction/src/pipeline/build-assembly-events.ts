import type {
  DrawingElement,
  ImageElement,
  Page,
  TableElement,
} from '@education-ai/document-ai'

import type { ClassifiedLine } from '../types/classified-line'

export type AssemblyEvent =
  | { kind: 'line'; classified: ClassifiedLine }
  | { kind: 'image'; element: ImageElement }
  | { kind: 'drawing'; element: DrawingElement }
  | { kind: 'table'; element: TableElement }

/**
 * Merges classified text lines with each page's diagram/table elements
 * into one reading-order event stream, sorted by vertical position within
 * each page. `assembleQuestions` walks this stream so a diagram sitting
 * between two lines attaches to whichever question/part was open at that
 * point on the page — the same rule already used for trailing body text.
 */
export function buildAssemblyEvents(
  pages: Page[],
  classifiedLines: ClassifiedLine[]
): AssemblyEvent[] {
  return pages.flatMap((page) => buildPageEvents(page, classifiedLines))
}

function buildPageEvents(
  page: Page,
  classifiedLines: ClassifiedLine[]
): AssemblyEvent[] {
  const lineItems = classifiedLines
    .filter((classified) => classified.line.pageNumber === page.pageNumber)
    .map((classified) => ({
      y: classified.line.boundingBox.y,
      event: { kind: 'line' as const, classified },
    }))

  const imageItems = page.imageElements.map((element) => ({
    y: element.boundingBox.y,
    event: { kind: 'image' as const, element },
  }))

  const drawingItems = page.drawingElements.map((element) => ({
    y: element.boundingBox.y,
    event: { kind: 'drawing' as const, element },
  }))

  const tableItems = page.tableElements.map((element) => ({
    y: element.boundingBox.y,
    event: { kind: 'table' as const, element },
  }))

  return [...lineItems, ...imageItems, ...drawingItems, ...tableItems]
    .sort((a, b) => a.y - b.y)
    .map((item) => item.event)
}
