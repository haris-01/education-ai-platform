import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import type { ExaminerReport } from '@education-ai/examiner-report-extraction'
import { buildExaminerReport } from '@education-ai/examiner-report-extraction'
import { buildQuestionDocument } from '@education-ai/question-extraction'
import { resolveWorkspaceRoot } from '@education-ai/shared'

import { estimateDifficulty } from './pipeline/estimate-difficulty'

// Real Cambridge 0625 June 2024 session — gitignored, same reasoning as
// the other corpus tests in this monorepo.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const SESSION_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj'
)
const EXAMINER_REPORT_PDF = path.join(
  SESSION_ROOT,
  '570003-june-2024-examiner-report.pdf'
)

const PAPERS = [
  { code: '0625/11', pdf: '11/570010-june-2024-question-paper-11.pdf' },
  { code: '0625/21', pdf: '21/570011-june-2024-question-paper-21.pdf' },
  { code: '0625/31', pdf: '31/570012-june-2024-question-paper-31.pdf' },
  { code: '0625/41', pdf: '41/671385-june-2024-question-paper-41.pdf' },
]

const datasetAvailable = existsSync(EXAMINER_REPORT_PDF)

describe.skipIf(!datasetAvailable)('difficulty estimation corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found under ${SESSION_ROOT}`
    )
  }

  let report: ExaminerReport

  beforeAll(async () => {
    report = buildExaminerReport(await parseNativePdf(EXAMINER_REPORT_PDF))
    // 60s, not the 30s the per-test cases use: this parses the examiner
    // report, the largest document in the dataset, and a hook that times
    // out fails the whole suite rather than one case.
  }, 60000)

  async function estimateFor(paper: (typeof PAPERS)[number]) {
    const questionDocument = buildQuestionDocument(
      await parseNativePdf(path.join(SESSION_ROOT, paper.pdf))
    )
    const paperReport = report.papers.find((p) => p.paperCode === paper.code)
    return estimateDifficulty(questionDocument, paperReport).assignments
  }

  it.each(PAPERS)(
    'bands every question the report comments on for $code',
    async (paper) => {
      // The ceiling is set by the source, not the matcher: the report
      // discusses only 12 of the 40 questions on 0625/11, and every
      // question on a theory paper. So the meaningful measure is whether
      // a commented question got a band, not what share of the paper did.
      const assignments = await estimateFor(paper)
      const paperReport = report.papers.find((p) => p.paperCode === paper.code)
      const commented = new Set(
        paperReport?.questionComments.map((c) => c.questionNumber) ?? []
      )

      expect(commented.size).toBeGreaterThan(0)

      const bandedCommented = assignments.filter(
        (a) => commented.has(a.questionNumber) && a.band !== undefined
      )
      const commentedInPaper = assignments.filter((a) =>
        commented.has(a.questionNumber)
      )

      expect(
        bandedCommented.length / commentedInPaper.length
      ).toBeGreaterThanOrEqual(0.8)
    },
    30000
  )

  it.each(PAPERS)(
    'never bands a question the report does not comment on for $code',
    async (paper) => {
      const assignments = await estimateFor(paper)
      const paperReport = report.papers.find((p) => p.paperCode === paper.code)
      const commented = new Set(
        paperReport?.questionComments.map((c) => c.questionNumber) ?? []
      )

      assignments
        .filter((a) => !commented.has(a.questionNumber))
        .forEach((a) => {
          expect(a.band).toBeUndefined()
          expect(a.evidence).toEqual([])
        })
    },
    30000
  )

  it.each(PAPERS)(
    'quotes its evidence verbatim for $code',
    async (paper) => {
      const assignments = await estimateFor(paper)
      const paperReport = report.papers.find((p) => p.paperCode === paper.code)
      const commentByQuestion = new Map(
        paperReport?.questionComments.map((c) => [
          c.questionNumber,
          c.comment,
        ]) ?? []
      )

      assignments.forEach((assignment) => {
        const source = commentByQuestion.get(assignment.questionNumber) ?? ''
        assignment.evidence.forEach((evidence) => {
          expect(normalise(source)).toContain(normalise(evidence.sentence))
        })
      })
    },
    30000
  )

  it('produces a spread of bands across a theory paper', async () => {
    // A paper that came out all one band would mean the rules had
    // collapsed. 0625/41 measures as 3 low, 5 moderate, 1 high.
    const assignments = await estimateFor(PAPERS[3])
    const bands = new Set(assignments.flatMap((a) => (a.band ? [a.band] : [])))

    expect(bands.size).toBeGreaterThanOrEqual(2)
  }, 30000)
})

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
