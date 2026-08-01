import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { resolveWorkspaceRoot } from '@education-ai/shared'

import { buildExaminerReport } from './pipeline/build-examiner-report'

// Real Cambridge 0625 examiner report — gitignored, same reasoning as the
// other corpus tests in this monorepo. Only one examiner report exists in
// the Phase 1 dataset (unlike question papers and mark schemes, which
// have several) — this test gets its coverage from validating all 18
// paper sections within that one document, not from multiple documents.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const EXAMINER_REPORT_PATH = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/570003-june-2024-examiner-report.pdf'
)

const EXPECTED_PAPER_CODES = [
  '11',
  '12',
  '13',
  '21',
  '22',
  '23',
  '31',
  '32',
  '33',
  '41',
  '42',
  '43',
  '51',
  '52',
  '53',
  '61',
  '62',
  '63',
].map((suffix) => `0625/${suffix}`)

const datasetAvailable = existsSync(EXAMINER_REPORT_PATH)

describe.skipIf(!datasetAvailable)('examiner report corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found at ${EXAMINER_REPORT_PATH}`
    )
  }

  it(
    'extracts all 18 paper sections with general and per-question comments',
    async () => {
      const parsed = await parseNativePdf(EXAMINER_REPORT_PATH)
      const { papers } = buildExaminerReport(parsed)

      expect(papers.map((p) => p.paperCode)).toEqual(EXPECTED_PAPER_CODES)

      papers.forEach((paper) => {
        expect(paper.generalComments.length).toBeGreaterThan(0)
        expect(paper.questionComments.length).toBeGreaterThan(0)
        paper.questionComments.forEach((questionComment) => {
          expect(questionComment.comment.length).toBeGreaterThan(0)
        })
      })
    },
    30000
  )
})
