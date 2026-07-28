import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'

const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/4/595786-2023-specimen-paper-4.pdf'

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)
  const questionDocument = buildQuestionDocument(parsed)

  console.info(JSON.stringify(questionDocument.metadata, null, 2))
  console.info(`questions found: ${questionDocument.questions.length}`)

  const pageElementTotals = parsed.pages.reduce(
    (acc, page) => ({
      images: acc.images + page.imageElements.length,
      drawings: acc.drawings + page.drawingElements.length,
      tables: acc.tables + page.tableElements.length,
    }),
    { images: 0, drawings: 0, tables: 0 }
  )
  console.info(
    `source elements: ${JSON.stringify(pageElementTotals)}`
  )

  const attachedTotals = questionDocument.questions.reduce(
    (acc, q) => {
      const allParts = q.parts.flatMap((p) => [p, ...p.subParts])
      const entities = [q, ...allParts]
      return entities.reduce(
        (inner, e) => ({
          images: inner.images + e.imageRefs.length,
          drawings: inner.drawings + e.drawingRefs.length,
          tables: inner.tables + e.tableRefs.length,
        }),
        acc
      )
    },
    { images: 0, drawings: 0, tables: 0 }
  )
  console.info(`attached to questions: ${JSON.stringify(attachedTotals)}`)

  const summary = questionDocument.questions.map((q) => ({
    number: q.number,
    marks: q.marks,
    pages: q.pageNumbers,
    drawingRefs: q.drawingRefs,
    tableRefs: q.tableRefs,
    parts: q.parts.map((p) => ({
      label: p.label,
      marks: p.marks,
      drawingRefs: p.drawingRefs,
      tableRefs: p.tableRefs,
      subParts: p.subParts.map((s) => ({
        label: s.label,
        marks: s.marks,
        drawingRefs: s.drawingRefs,
        tableRefs: s.tableRefs,
      })),
    })),
  }))
  console.info(JSON.stringify(summary, null, 2))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
