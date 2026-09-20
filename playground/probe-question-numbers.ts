import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import {
  classifyLines,
  reconstructLines,
} from '../packages/question-extraction/src/index.js'

const SAMPLE_PDF = process.argv[2]

async function main(): Promise<void> {
  if (!SAMPLE_PDF) {
    throw new Error('usage: tsx probe-question-numbers.ts <relative-pdf-path>')
  }
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)
  const allLines = parsed.pages.flatMap((page) => reconstructLines(page))
  const allClassified = classifyLines(allLines)

  allClassified
    .filter((c) => c.role === 'questionNumber')
    .forEach((c) => {
      console.info(
        `page ${c.line.pageNumber} x=${c.line.boundingBox.x.toFixed(0)} Q${c.questionNumber} | ${c.line.text}`
      )
    })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
