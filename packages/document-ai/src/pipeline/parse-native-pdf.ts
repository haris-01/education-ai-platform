import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import type { Page, ParsedDocument, TextElement } from '../types'
import { extractDrawingElements } from './extract-drawing-elements'
import { extractImageElements } from './extract-image-elements'
import { extractTableElements } from './extract-table-elements'
import { resolveStandardFontDataUrl } from './pdfjs-standard-fonts'
import type {
  PageViewport,
  TextContent,
  TextContentItem,
  TextItem,
} from './pdfjs-types'

const PARSER_VERSION = '0.2.0'

/**
 * Parses a native (text-based) PDF into a `ParsedDocument`: pages with
 * positioned text, vector drawings, tables, and images.
 */
export async function parseNativePdf(
  filePath: string
): Promise<ParsedDocument> {
  const data = await readFile(filePath)
  const pdf = await getDocument({
    data: new Uint8Array(data),
    standardFontDataUrl: resolveStandardFontDataUrl(),
  }).promise

  const pageNumbers = Array.from(
    { length: pdf.numPages },
    (_, index) => index + 1
  )
  const pages = await Promise.all(
    pageNumbers.map((pageNumber) => parsePage(pdf, pageNumber, filePath))
  )

  // This stage only knows the file on disk, not the Cambridge resource it
  // came from — a caller further up the pipeline can overwrite `resourceId`
  // once it stitches this together with a `DocumentResource`.
  const title = path.parse(filePath).name

  return {
    metadata: {
      resourceId: title,
      title,
      pageCount: pdf.numPages,
      parsedAt: new Date(),
      parserVersion: PARSER_VERSION,
    },
    pages,
  }
}

async function parsePage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  sourcePdfPath: string
): Promise<Page> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const [textContent, operatorList] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ])

  const textElements = textContent.items
    .filter(isTextItem)
    .map((item, index) =>
      toTextElement(item, textContent.styles, viewport, pageNumber, index)
    )

  const drawingElements = extractDrawingElements(
    operatorList,
    viewport,
    pageNumber
  )
  const tableElements = extractTableElements(
    operatorList,
    viewport,
    pageNumber,
    textElements
  )
  const imageElements = await extractImageElements(
    page,
    operatorList,
    viewport,
    pageNumber,
    sourcePdfPath
  )

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    textElements,
    imageElements,
    drawingElements,
    tableElements,
  }
}

function isTextItem(item: TextContentItem): item is TextItem {
  return 'str' in item
}

function toTextElement(
  item: TextItem,
  styles: TextContent['styles'],
  viewport: PageViewport,
  pageNumber: number,
  index: number
): TextElement {
  const [, , c, d, e, f] = item.transform
  const fontSize = Math.hypot(c, d)
  const height = item.height || fontSize

  const [baselineX, baselineY] = viewport.convertToViewportPoint(e, f)

  return {
    id: `${pageNumber}-${index}`,
    pageNumber,
    text: item.str,
    fontFamily: styles[item.fontName]?.fontFamily,
    fontSize,
    boundingBox: {
      x: baselineX,
      y: baselineY - height,
      width: item.width,
      height,
    },
  }
}
