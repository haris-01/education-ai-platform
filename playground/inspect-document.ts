import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import {
  analyzeDocument,
  parseNativePdf,
} from '../packages/document-ai/src/index.js'
import type { ParsedDocument } from '../packages/document-ai/src/index.js'

// Real Cambridge IGCSE Physics (0625) documents already sitting in
// datasets/ from Phase 1. Picked to span the shapes Phase 2 needs to
// handle: a question paper (diagrams), a mark scheme (tables), and the
// syllabus (dense multi-column text, no diagrams).
const SAMPLE_DOCUMENTS = [
  {
    label: 'Specimen paper 1 (question paper)',
    relativePath:
      'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf',
  },
  {
    label: 'Specimen paper 1 (mark scheme)',
    relativePath:
      'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595771-2023-specimen-paper-1-mark-scheme.pdf',
  },
  {
    label: 'Syllabus 2023-2025',
    relativePath:
      'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf',
  },
  {
    label: 'June 2024 examiner report',
    relativePath:
      'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/570003-june-2024-examiner-report.pdf',
  },
  {
    label: 'Grade descriptions 2023-2025',
    relativePath:
      'datasets/cambridge/igcse/physics/0625/other/730281-2023-2025-grade-descriptions.pdf',
  },
]

const main = async () => {
  const workspaceRoot = resolveWorkspaceRoot(process.cwd())

  for (const doc of SAMPLE_DOCUMENTS) {
    const filePath = path.join(workspaceRoot, doc.relativePath)
    await inspectDocument(doc.label, filePath)
  }
}

const inspectDocument = async (label: string, filePath: string) => {
  const [analysis, parsed] = await Promise.all([
    analyzeDocument(filePath),
    parseNativePdf(filePath),
  ])

  console.info(`\n=== ${label} ===`)
  console.info(
    `classified as: ${analysis.type} (confidence ${analysis.confidence})`
  )
  console.info(
    `statistics: ${analysis.statistics.pageCount} pages, ` +
      `${analysis.statistics.textItemCount} text items, ` +
      `${analysis.statistics.imageCount} images, ` +
      `${analysis.statistics.drawingCount} drawings, ` +
      `${analysis.statistics.fontCount} fonts`
  )

  const extracted = summarizeExtraction(parsed)
  console.info(
    `parsed: ${extracted.textElementCount} text elements, ` +
      `${extracted.imageElementCount} image elements, ` +
      `${extracted.drawingElementCount} drawing elements, ` +
      `${extracted.tableElementCount} table elements`
  )

  logSampleTextElements(parsed)
  logSampleDrawingElements(parsed)
  logSampleTableElements(parsed)
  logSampleImageElements(parsed)
}

const summarizeExtraction = (parsed: ParsedDocument) => ({
  textElementCount: parsed.pages.reduce(
    (sum, page) => sum + page.textElements.length,
    0
  ),
  imageElementCount: parsed.pages.reduce(
    (sum, page) => sum + page.imageElements.length,
    0
  ),
  drawingElementCount: parsed.pages.reduce(
    (sum, page) => sum + page.drawingElements.length,
    0
  ),
  tableElementCount: parsed.pages.reduce(
    (sum, page) => sum + page.tableElements.length,
    0
  ),
})

const logSampleTextElements = (parsed: ParsedDocument) => {
  const firstPage = parsed.pages[0]
  if (!firstPage) {
    return
  }

  console.info('first page, first 5 text elements:')
  firstPage.textElements.slice(0, 5).forEach((element) => {
    const { x, y, width, height } = element.boundingBox
    console.info(
      `  "${element.text}" @ (${x.toFixed(1)}, ${y.toFixed(1)}) ` +
        `${width.toFixed(1)}x${height.toFixed(1)}, font ${element.fontSize.toFixed(1)}px`
    )
  })
}

const logSampleDrawingElements = (parsed: ParsedDocument) => {
  const busiestPage = [...parsed.pages].sort(
    (a, b) => b.drawingElements.length - a.drawingElements.length
  )[0]
  if (!busiestPage || busiestPage.drawingElements.length === 0) {
    return
  }

  console.info(
    `page ${busiestPage.pageNumber}, first 5 of ${busiestPage.drawingElements.length} drawing elements:`
  )
  busiestPage.drawingElements.slice(0, 5).forEach((element) => {
    const { x, y, width, height } = element.boundingBox
    console.info(
      `  @ (${x.toFixed(1)}, ${y.toFixed(1)}) ${width.toFixed(1)}x${height.toFixed(1)}`
    )
  })
}

const logSampleTableElements = (parsed: ParsedDocument) => {
  const tables = parsed.pages.flatMap((page) => page.tableElements)
  if (tables.length === 0) {
    return
  }

  console.info(`first 5 of ${tables.length} table elements:`)
  tables.slice(0, 5).forEach((table) => {
    const { x, y, width, height } = table.boundingBox
    console.info(
      `  page ${table.pageNumber}: ${table.rows}x${table.columns} @ ` +
        `(${x.toFixed(1)}, ${y.toFixed(1)}) ${width.toFixed(1)}x${height.toFixed(1)}`
    )
  })
}

const logSampleImageElements = (parsed: ParsedDocument) => {
  const images = parsed.pages.flatMap((page) => page.imageElements)
  if (images.length === 0) {
    return
  }

  console.info(`${images.length} image elements:`)
  images.forEach((image) => {
    const { x, y, width, height } = image.boundingBox
    console.info(
      `  page ${image.pageNumber}: ${image.width}x${image.height}px -> ${image.imagePath} ` +
        `@ (${x.toFixed(1)}, ${y.toFixed(1)}) ${width.toFixed(1)}x${height.toFixed(1)}`
    )
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
