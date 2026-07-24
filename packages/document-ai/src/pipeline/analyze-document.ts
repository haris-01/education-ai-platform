import { readFile } from 'node:fs/promises'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import type {
  DocumentAnalysis,
  DocumentStatistics,
  DocumentType,
} from '../types'

// Any operator that paints image data onto the page, in one form or another.
const IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectRepeat,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintSolidColorImageMask,
])

export async function analyzeDocument(
  filePath: string
): Promise<DocumentAnalysis> {
  const data = await readFile(filePath)
  const pdf = await getDocument({ data: new Uint8Array(data) }).promise

  const statistics = await collectStatistics(pdf)

  return { ...classify(statistics), statistics }
}

interface PageStatistics {
  textItemCount: number
  fontNames: string[]
  imageCount: number
  drawingCount: number
}

async function collectStatistics(
  pdf: PDFDocumentProxy
): Promise<DocumentStatistics> {
  const pageNumbers = Array.from(
    { length: pdf.numPages },
    (_, index) => index + 1
  )

  const pageStats = await Promise.all(
    pageNumbers.map((pageNumber) => collectPageStatistics(pdf, pageNumber))
  )

  const fontNames = new Set(pageStats.flatMap((stats) => stats.fontNames))
  const sum = (select: (stats: PageStatistics) => number) =>
    pageStats.reduce((total, stats) => total + select(stats), 0)

  return {
    pageCount: pdf.numPages,
    textItemCount: sum((stats) => stats.textItemCount),
    imageCount: sum((stats) => stats.imageCount),
    drawingCount: sum((stats) => stats.drawingCount),
    fontCount: fontNames.size,
  }
}

async function collectPageStatistics(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<PageStatistics> {
  const page = await pdf.getPage(pageNumber)
  const [textContent, operatorList] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ])

  return {
    textItemCount: textContent.items.length,
    fontNames: Object.keys(textContent.styles),
    imageCount: operatorList.fnArray.filter((fn) => IMAGE_OPS.has(fn)).length,
    drawingCount: operatorList.fnArray.filter((fn) => fn === OPS.constructPath)
      .length,
  }
}

// Deliberately simple for now: a first pass to unblock the pipeline. This
// will be replaced with a real model/heuristic once we have ground truth.
function classify(statistics: DocumentStatistics): {
  type: DocumentType
  confidence: number
} {
  const { textItemCount, imageCount } = statistics

  if (textItemCount === 0) {
    return { type: 'scanned', confidence: 0.9 }
  }

  if (textItemCount > 500 && imageCount < 20) {
    return { type: 'native', confidence: 0.99 }
  }

  return { type: 'hybrid', confidence: 0.7 }
}
