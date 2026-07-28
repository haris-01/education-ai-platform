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

  const summary = questionDocument.questions.map((q) => ({
    number: q.number,
    marks: q.marks,
    pages: q.pageNumbers,
    parts: q.parts.map((p) => ({
      label: p.label,
      marks: p.marks,
      subParts: p.subParts.map((s) => `${s.label}[${s.marks ?? '?'}]`),
    })),
  }))
  console.info(JSON.stringify(summary, null, 2))

  console.info('\n--- full detail: question 2 ---')
  console.info(
    JSON.stringify(
      questionDocument.questions.find((q) => q.number === 2),
      null,
      2
    )
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
