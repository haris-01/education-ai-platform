import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const rel = process.argv[2]
  const parsed = await parseNativePdf(path.join(root, rel))

  parsed.pages.slice(0, 2).forEach((page) => {
    const text = page.textElements.map((element) => element.text).join(' | ')
    console.info(`--- page ${page.pageNumber} ---`)
    console.info(text.slice(0, 900))
    console.info('')
  })

  const all = parsed.pages.flatMap((page) =>
    page.textElements.map((element) => element.text)
  )
  const codes = all.filter((t) => /0625\s*\/\s*\d/.test(t))
  console.info('=== texts containing a 0625/ code ===')
  console.info([...new Set(codes)].slice(0, 12).join('\n'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
