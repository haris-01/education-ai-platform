import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { reconstructLines } from '../packages/question-extraction/src/index.js'

const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595771-2023-specimen-paper-1-mark-scheme.pdf'

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)

  console.info(`pages: ${parsed.pages.length}`)

  const pagesToInspect = [3, 4]

  pagesToInspect.forEach((pageNumber) => {
    const p = parsed.pages[pageNumber - 1]
    const lines = reconstructLines(p)
    console.info(`\n=== page ${pageNumber} (${lines.length} lines) ===`)
    lines.forEach((line) => {
      const x = line.boundingBox.x.toFixed(0).padStart(4)
      const y = line.boundingBox.y.toFixed(0).padStart(4)
      console.info(`x=${x} y=${y} | ${line.text}`)
    })
    console.info(
      `tables on page: ${p.tableElements.length}, drawings: ${p.drawingElements.length}`
    )
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
