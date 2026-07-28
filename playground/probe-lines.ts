import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import {
  classifyLines,
  reconstructLines,
} from '../packages/question-extraction/src/index.js'

const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf'

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)

  // Classify across the whole document (not per page) — the left-margin
  // estimate needs enough samples to be reliable.
  const allLines = parsed.pages.flatMap((page) => reconstructLines(page))
  const allClassified = classifyLines(allLines)

  const pagesToInspect = [6, 7]

  pagesToInspect.forEach((pageNumber) => {
    const classified = allClassified.filter(
      (entry) => entry.line.pageNumber === pageNumber
    )
    console.info(`\n=== page ${pageNumber} (${classified.length} lines) ===`)
    classified.forEach((entry) => {
      const x = entry.line.boundingBox.x.toFixed(0).padStart(4)
      const role = entry.role.padEnd(13)
      const embeddedLabels = `${entry.partLabel ? `(${entry.partLabel})` : ''}${entry.nestedPartLabel ? `(${entry.nestedPartLabel})` : ''}`
      const marker =
        entry.role === 'questionNumber'
          ? `Q${entry.questionNumber}${embeddedLabels}`
          : entry.role === 'subpart'
            ? `(${entry.partLabel})${entry.nestedPartLabel ? `(${entry.nestedPartLabel})` : ''}`
            : entry.role === 'subSubpart'
              ? `(${entry.partLabel})`
              : ''
      const marks =
        entry.marks !== undefined
          ? `marks=${entry.marks}`
          : entry.totalMarks !== undefined
            ? `total=${entry.totalMarks}`
            : ''
      console.info(
        `x=${x} ${role} ${marker.padEnd(6)} ${marks.padEnd(10)} | ${entry.line.text}`
      )
    })
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
