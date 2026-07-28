import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'

const SAMPLE_PDF =
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf'

async function main(): Promise<void> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), SAMPLE_PDF)
  const parsed = await parseNativePdf(filePath)
  const questionDocument = buildQuestionDocument(parsed)

  console.info(`questions found: ${questionDocument.questions.length}`)

  const numbers = questionDocument.questions.map((q) => q.number)
  console.info(`numbers: ${numbers.join(',')}`)

  const withoutFourOptions = questionDocument.questions.filter(
    (q) => q.options.length !== 4
  )
  console.info(
    `questions without exactly 4 options: ${withoutFourOptions.map((q) => `Q${q.number}(${q.options.length})`).join(', ') || 'none'}`
  )

  const badLabels = questionDocument.questions.filter(
    (q) => JSON.stringify(q.options.map((o) => o.label)) !== JSON.stringify(['A', 'B', 'C', 'D'])
  )
  console.info(
    `questions with wrong label sequence: ${badLabels.map((q) => `Q${q.number}[${q.options.map((o) => o.label).join(',')}]`).join(', ') || 'none'}`
  )

  console.info('\n--- sample: question 1 (was inline-packed) ---')
  console.info(
    JSON.stringify(
      questionDocument.questions.find((q) => q.number === 1),
      null,
      2
    )
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
