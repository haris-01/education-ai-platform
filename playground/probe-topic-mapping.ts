import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'
import { buildSyllabusOverview } from '../packages/syllabus-extraction/src/index.js'
import { assignTopics } from '../packages/topic-mapping/src/index.js'

const QUESTION_PAPERS = [
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf',
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/4/595786-2023-specimen-paper-4.pdf',
]
const SYLLABUS_PDF =
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const syllabusParsed = await parseNativePdf(path.join(root, SYLLABUS_PDF))
  const syllabus = buildSyllabusOverview(syllabusParsed)

  for (const paperPath of QUESTION_PAPERS) {
    const parsed = await parseNativePdf(path.join(root, paperPath))
    const questionDocument = buildQuestionDocument(parsed)
    const { assignments } = assignTopics(questionDocument, syllabus)

    const classified = assignments.filter((a) => a.topicNumber !== undefined)
    console.info(`\n=== ${paperPath} ===`)
    console.info(`classified: ${classified.length}/${assignments.length}`)
    assignments.forEach((a) => {
      console.info(
        `Q${a.questionNumber}: ${a.topicName ?? 'UNCLASSIFIED'}  [${a.matchedKeywords.join(', ')}]`
      )
    })
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
