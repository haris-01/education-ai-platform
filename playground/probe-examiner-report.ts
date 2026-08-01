import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildExaminerReport } from '../packages/examiner-report-extraction/src/index.js'

const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/570003-june-2024-examiner-report.pdf'

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)
  const report = buildExaminerReport(parsed)

  console.info(`papers found: ${report.papers.length}`)
  console.info(report.papers.map((p) => p.paperCode).join(', '))

  const paper11 = report.papers.find((p) => p.paperCode === '0625/11')
  console.info(`\n--- 0625/11: ${paper11?.questionComments.length} question comments ---`)
  console.info(`general comments: ${paper11?.generalComments.slice(0, 200)}...`)
  console.info(JSON.stringify(paper11?.questionComments.slice(0, 2), null, 2))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
