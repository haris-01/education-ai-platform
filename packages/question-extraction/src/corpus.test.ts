import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { resolveWorkspaceRoot } from '@education-ai/shared'

import { buildQuestionDocument } from './pipeline/build-question-document'

// Real Cambridge 0625 question papers, crawled in Phase 1 and gitignored
// (datasets/ isn't committed — these are copyrighted exam papers, not
// fixtures). This suite is the automated version of the manual sweep that
// found the left-margin and MCQ-option bugs: it only has teeth on a
// machine that actually has the crawled dataset, so it skips cleanly
// everywhere else (CI, a fresh clone) instead of failing on missing files.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const DATASET_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625'
)

const QUESTION_PAPERS = [
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

const datasetAvailable = existsSync(DATASET_ROOT)

describe.skipIf(!datasetAvailable)('question extraction corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found at ${DATASET_ROOT}`
    )
  }

  it.each(QUESTION_PAPERS)(
    'produces a well-formed QuestionDocument for %s',
    async (relativePath) => {
      const filePath = path.join(DATASET_ROOT, relativePath)
      const parsed = await parseNativePdf(filePath)
      const { questions } = buildQuestionDocument(parsed)

      expect(questions.length).toBeGreaterThan(0)

      const numbers = questions.map((q) => q.number)
      const expectedSequence = numbers.map((_, index) => numbers[0] + index)
      expect(numbers).toEqual(expectedSequence)

      questions.forEach((q) => {
        expect(
          q.text.trim() !== '' || q.parts.length > 0 || q.options.length > 0
        ).toBe(true)

        if (q.marks !== undefined && q.parts.length > 0) {
          const sum = q.parts.reduce((partSum, part) => {
            if (part.marks !== undefined) {
              return partSum + part.marks
            }
            return (
              partSum +
              part.subParts.reduce((subSum, sub) => subSum + (sub.marks ?? 0), 0)
            )
          }, 0)
          expect(sum).toBe(q.marks)
        }

        // Any confirmed option list must be a clean 4-way A-D run —
        // partial/broken runs are recovered into text, never left as
        // options (see the "does not mistake an ordinary sentence..."
        // regression test in build-question-document.test.ts).
        if (q.options.length > 0) {
          expect(q.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D'])
        }
      })
    },
    30000
  )
})
