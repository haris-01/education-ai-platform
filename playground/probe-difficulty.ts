import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'
import { buildExaminerReport } from '../packages/examiner-report-extraction/src/index.js'
import { estimateDifficulty } from '../packages/difficulty-estimation/src/index.js'

const DATASET_ROOT = 'datasets/cambridge/igcse/physics/0625'
const SESSION = `${DATASET_ROOT}/past-papers/2024/mj`
const REPORT = `${SESSION}/570003-june-2024-examiner-report.pdf`

const PAPERS = [
  { code: '0625/11', pdf: '11/570010-june-2024-question-paper-11.pdf' },
  { code: '0625/21', pdf: '21/570011-june-2024-question-paper-21.pdf' },
  { code: '0625/31', pdf: '31/570012-june-2024-question-paper-31.pdf' },
  { code: '0625/41', pdf: '41/671385-june-2024-question-paper-41.pdf' },
  { code: '0625/51', pdf: '51/671386-june-2024-question-paper-51.pdf' },
  { code: '0625/61', pdf: '61/671387-june-2024-question-paper-61.pdf' },
]

async function main(): Promise<void> {
  const root = resolveWorkspaceRoot(process.cwd())
  const report = buildExaminerReport(
    await parseNativePdf(path.join(root, REPORT))
  )

  for (const paper of PAPERS) {
    const questionDocument = buildQuestionDocument(
      await parseNativePdf(path.join(root, SESSION, paper.pdf))
    )
    const paperReport = report.papers.find((p) => p.paperCode === paper.code)
    const { assignments } = estimateDifficulty(questionDocument, paperReport)

    const counts = assignments.reduce<Record<string, number>>(
      (acc, a) => ({
        ...acc,
        [a.band ?? 'none']: (acc[a.band ?? 'none'] ?? 0) + 1,
      }),
      {}
    )
    const banded = assignments.filter((a) => a.band !== undefined)
    const coverage = Math.round((banded.length / assignments.length) * 100)

    console.info(
      `${paper.code} | ${String(assignments.length).padStart(2)} questions | banded ${String(banded.length).padStart(2)} (${String(coverage).padStart(3)}%) | ${JSON.stringify(counts)}`
    )
  }

  const paper41 = report.papers.find((p) => p.paperCode === '0625/41')
  const qd41 = buildQuestionDocument(
    await parseNativePdf(path.join(root, SESSION, PAPERS[3].pdf))
  )
  console.info('\n=== 0625/41 per question ===')
  estimateDifficulty(qd41, paper41).assignments.forEach((a) => {
    console.info(
      `Q${String(a.questionNumber).padStart(2)}: ${String(a.band ?? '-').padEnd(8)} (${a.evidence.length} signals)`
    )
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
