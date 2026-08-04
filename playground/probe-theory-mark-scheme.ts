import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildTheoryMarkScheme } from '../packages/mark-scheme-extraction/src/index.js'

const MARK_SCHEMES = [
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/41/671373-june-2024-mark-scheme-paper-41.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/31/570006-june-2024-mark-scheme-paper-31.pdf',
]

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())

  for (const msPath of MARK_SCHEMES) {
    const parsed = await parseNativePdf(path.join(root, msPath))
    const markScheme = buildTheoryMarkScheme(parsed)

    console.info(`\n=== ${msPath} ===`)
    console.info(`questions: ${markScheme.questions.length}`)
    markScheme.questions.forEach((q) => {
      console.info(
        `\nQ${q.questionNumber} (${q.markPoints.length} mark points)`
      )
      q.markPoints.forEach((mp) => {
        console.info(`  [${mp.markCode ?? '-'}] ${mp.text.slice(0, 90)}`)
      })
    })
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
