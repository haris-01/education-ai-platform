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

  it('extracts all 18 paper sections with general and per-question comments', async () => {
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
  }, 30000)

  it('extracts common mistakes as verbatim sentences from the commentary', async () => {
    const parsed = await parseNativePdf(EXAMINER_REPORT_PATH)
    const { papers } = buildExaminerReport(parsed)

    papers.forEach((paper) => {
      paper.questionComments.forEach((questionComment) => {
        questionComment.commonMistakes.forEach((mistake) => {
          // Verbatim, not paraphrased — the value of these strings is
          // that a teacher can check them against the source report.
          // Whitespace is normalised, so compare on that basis.
          expect(normalise(questionComment.comment)).toContain(
            normalise(mistake)
          )

          // A fragment left by a bad sentence split is not quotable.
          expect(mistake.length).toBeGreaterThan(20)
          expect(mistake).not.toMatch(/\bFig\.$/)
        })
      })
    })
  }, 30000)

  it('finds mistakes on every theory paper', async () => {
    const parsed = await parseNativePdf(EXAMINER_REPORT_PATH)
    const { papers } = buildExaminerReport(parsed)

    // Theory papers (3x and 4x) carry the longest commentary and so the
    // most criticism. Measured across the six of them: 7/11 on 0625/32 at
    // the low end, 11/11 on 0625/42 and 0625/43 at the high end. The floor
    // sits just under the measured minimum — it guards against a
    // regression in marker matching without pinning a count that ordinary
    // session-to-session variation in examiner wording would break.
    const theoryPapers = papers.filter((paper) =>
      /^0625\/[34]/.test(paper.paperCode)
    )
    expect(theoryPapers).toHaveLength(6)

    theoryPapers.forEach((paper) => {
      const withMistakes = paper.questionComments.filter(
        (c) => c.commonMistakes.length > 0
      )
      expect(
        withMistakes.length / paper.questionComments.length
      ).toBeGreaterThanOrEqual(0.6)
    })
  }, 30000)
})

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
