import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildSyllabusOverview } from '../packages/syllabus-extraction/src/index.js'

const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/syllabus/697209-2026-2028-syllabus.pdf'

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)
  const overview = buildSyllabusOverview(parsed)

  console.info(JSON.stringify(overview.topics, null, 2))
  console.info(JSON.stringify(overview.assessmentObjectives, null, 2))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
