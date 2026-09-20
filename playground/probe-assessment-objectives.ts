import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'
import { buildSyllabusOverview } from '../packages/syllabus-extraction/src/index.js'
import { assignAssessmentObjectives } from '../packages/assessment-objective-mapping/src/index.js'

const DATASET_ROOT = 'datasets/cambridge/igcse/physics/0625'
const SYLLABUS = `${DATASET_ROOT}/syllabus/595430-2023-2025-syllabus.pdf`

const PAPERS = [
  'specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf',
  'specimen-papers/2023/2/595784-2023-specimen-paper-2.pdf',
  'specimen-papers/2023/3/595785-2023-specimen-paper-3.pdf',
  'specimen-papers/2023/4/595786-2023-specimen-paper-4.pdf',
  'specimen-papers/2023/5/595788-2023-specimen-paper-5.pdf',
  'specimen-papers/2023/6/595789-2023-specimen-paper-6.pdf',
  'past-papers/2024/mj/11/570010-june-2024-question-paper-11.pdf',
  'past-papers/2024/mj/21/570011-june-2024-question-paper-21.pdf',
  'past-papers/2024/mj/31/570012-june-2024-question-paper-31.pdf',
  'past-papers/2024/mj/41/671385-june-2024-question-paper-41.pdf',
  'past-papers/2024/mj/51/671386-june-2024-question-paper-51.pdf',
  'past-papers/2024/mj/61/671387-june-2024-question-paper-61.pdf',
]

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const syllabus = buildSyllabusOverview(
    await parseNativePdf(path.join(root, SYLLABUS))
  )

  console.info(`command words extracted: ${syllabus.commandWords.length}`)
  console.info('')

  for (const relative of PAPERS) {
    const parsed = await parseNativePdf(path.join(root, DATASET_ROOT, relative))
    const questionDocument = buildQuestionDocument(parsed)
    const { assignments } = assignAssessmentObjectives(
      questionDocument,
      syllabus
    )

    const classified = assignments.filter((a) => a.objectives.length > 0)
    const totals = assignments.reduce<Record<string, number>>(
      (acc, a) =>
        a.objectives.reduce(
          (inner, code) => ({ ...inner, [code]: (inner[code] ?? 0) + 1 }),
          acc
        ),
      {}
    )

    const paperCode = questionDocument.metadata.paper?.code ?? '??'
    const coverage = Math.round((classified.length / assignments.length) * 100)

    console.info(
      `paper ${paperCode.padEnd(2)} | questions ${String(assignments.length).padStart(2)} | classified ${String(classified.length).padStart(2)} (${String(coverage).padStart(3)}%) | ${JSON.stringify(totals)}`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
