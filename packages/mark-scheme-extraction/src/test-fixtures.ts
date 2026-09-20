import type {
  Page,
  ParsedDocument,
  TableElement,
  TextElement,
} from '@education-ai/document-ai'

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

// `rows` is the raw cell grid including the header row (e.g.
// `[['Question', 'Answer', 'Marks'], ['1(a)', '...', 'B1']]`) — everything
// `buildTheoryMarkScheme` reads (`cells`, `boundingBox.y`) comes from this;
// `rowBoundaries`/`columnBoundaries` are unused by that function and only
// filled in here to satisfy the `TableElement` type.
export function tableElement(
  pageNumber: number,
  y: number,
  rows: string[][]
): TableElement {
  nextElementId += 1
  const columns = rows[0]?.length ?? 0
  return {
    id: `table-${nextElementId}`,
    pageNumber,
    boundingBox: { x: 0, y, width: 500, height: rows.length * 20 },
    rows: rows.length,
    columns,
    rowBoundaries: rows.map((_, i) => y + i * 20),
    columnBoundaries: Array.from({ length: columns + 1 }, (_, i) => i * 100),
    cells: rows,
  }
}

export function page(
  pageNumber: number,
  textElements: TextElement[],
  tableElements: TableElement[] = []
): Page {
  return {
    pageNumber,
    width: 595,
    height: 842,
    textElements,
    imageElements: [],
    drawingElements: [],
    tableElements,
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
