import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'

// A theory-paper mark scheme — the table shape (Question / Answer / Marks)
// this feature exists to read, and a page not covered by any existing
// corpus test (mark-scheme-extraction's corpus is MCQ-only so far).
const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/41/671373-june-2024-mark-scheme-paper-41.pdf'
const SAMPLE_PAGE_INDEX = 6

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)
  const page = parsed.pages[SAMPLE_PAGE_INDEX]

  console.info(`page ${page.pageNumber}: ${page.tableElements.length} tables`)
  page.tableElements.forEach((table) => {
    console.info(`\n=== ${table.id} (${table.rows}x${table.columns}) ===`)
    table.cells.forEach((row) => console.info(JSON.stringify(row)))
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
