import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { resolveWorkspaceRoot } from '@education-ai/shared'

import { buildMcqMarkScheme } from './pipeline/build-mcq-mark-scheme'
import { buildTheoryMarkScheme } from './pipeline/build-theory-mark-scheme'

// Real Cambridge 0625 MCQ mark schemes — gitignored, same reasoning as
// question-extraction's corpus test (copyrighted, not committed). Skips
// itself when the dataset isn't present.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const DATASET_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625'
)

const MCQ_MARK_SCHEMES = [
  'specimen-papers/2023/1/595771-2023-specimen-paper-1-mark-scheme.pdf',
  'specimen-papers/2023/2/595772-2023-specimen-paper-2-mark-scheme.pdf',
  'past-papers/2024/mj/11/570004-june-2024-mark-scheme-paper-11.pdf',
  'past-papers/2024/mj/21/570005-june-2024-mark-scheme-paper-21.pdf',
]

const datasetAvailable = existsSync(DATASET_ROOT)

describe.skipIf(!datasetAvailable)('mcq mark scheme corpus', () => {
  if (!datasetAvailable) {
    console.info(`[corpus.test] skipped — dataset not found at ${DATASET_ROOT}`)
  }

  it.each(MCQ_MARK_SCHEMES)(
    'extracts a complete, sequential answer key for %s',
    async (relativePath) => {
      const filePath = path.join(DATASET_ROOT, relativePath)
      const parsed = await parseNativePdf(filePath)
      const { answers } = buildMcqMarkScheme(parsed)

      const numbers = answers.map((a) => a.questionNumber)
      expect(numbers).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))

      answers.forEach((answer) => {
        expect(
          answer.answer === 'Discounted' || /^[A-D]$/.test(answer.answer)
        ).toBe(true)
        expect(answer.marks).toBeGreaterThan(0)
      })
    },
    30000
  )
})

// Only the 2024 mj session's theory papers use the table layout this
// extractor supports (see build-theory-mark-scheme.ts) — the 2023
// specimen-paper mark schemes are deliberately excluded here, not
// forgotten; buildTheoryMarkScheme.test.ts and its own JSDoc cover why.
const THEORY_MARK_SCHEMES = [
  'past-papers/2024/mj/31/570006-june-2024-mark-scheme-paper-31.pdf',
  'past-papers/2024/mj/41/671373-june-2024-mark-scheme-paper-41.pdf',
]

describe.skipIf(!datasetAvailable)('theory mark scheme corpus', () => {
  it.each(THEORY_MARK_SCHEMES)(
    'reads marking points grouped by question for %s',
    async (relativePath) => {
      const filePath = path.join(DATASET_ROOT, relativePath)
      const parsed = await parseNativePdf(filePath)
      const { questions } = buildTheoryMarkScheme(parsed)

      // Both papers run to at least question 8; a low count would mean the
      // table detector missed most of the pages.
      expect(questions.length).toBeGreaterThanOrEqual(8)

      questions.forEach((question) => {
        expect(question.questionNumber).toMatch(/^\d+/)
        expect(question.markPoints.length).toBeGreaterThan(0)
        question.markPoints.forEach((markPoint) => {
          expect(markPoint.text.length).toBeGreaterThan(0)
        })
      })
    },
    30000
  )
})
