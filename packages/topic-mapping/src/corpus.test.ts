import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { buildQuestionDocument } from '@education-ai/question-extraction'
import { resolveWorkspaceRoot } from '@education-ai/shared'
import { buildSyllabusOverview } from '@education-ai/syllabus-extraction'

import { assignTopics } from './pipeline/assign-topics'

// Real Cambridge 0625 documents — gitignored, same reasoning as the other
// corpus tests in this monorepo. The keyword table is curated by hand
// (see topic-keywords.ts), so this test is not chasing 100%: it pins down
// a "good enough to be useful" floor and catches wholesale regressions
// (e.g. a keyword list accidentally emptied) rather than exact counts,
// since minor keyword-list tuning shouldn't break the suite.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const SYLLABUS_PDF = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'
)
const QUESTION_PAPERS = [
  {
    path: path.join(
      WORKSPACE_ROOT,
      'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf'
    ),
    minClassificationRate: 0.7,
  },
  {
    path: path.join(
      WORKSPACE_ROOT,
      'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/4/595786-2023-specimen-paper-4.pdf'
    ),
    minClassificationRate: 0.8,
  },
]

const datasetAvailable =
  existsSync(SYLLABUS_PDF) && QUESTION_PAPERS.every((p) => existsSync(p.path))

describe.skipIf(!datasetAvailable)('topic mapping corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found under ${WORKSPACE_ROOT}`
    )
  }

  it.each(QUESTION_PAPERS)(
    'classifies most questions in %s above the floor rate',
    async ({ path: paperPath, minClassificationRate }) => {
      const syllabusParsed = await parseNativePdf(SYLLABUS_PDF)
      const syllabus = buildSyllabusOverview(syllabusParsed)

      const parsed = await parseNativePdf(paperPath)
      const questionDocument = buildQuestionDocument(parsed)
      const { assignments } = assignTopics(questionDocument, syllabus)

      expect(assignments).toHaveLength(questionDocument.questions.length)

      const classified = assignments.filter((a) => a.topicNumber !== undefined)
      const rate = classified.length / assignments.length
      expect(rate).toBeGreaterThanOrEqual(minClassificationRate)

      assignments.forEach((assignment) => {
        const isClassified = assignment.topicNumber !== undefined
        expect(assignment.matchedKeywords.length > 0).toBe(isClassified)
        expect(assignment.topicName !== undefined).toBe(isClassified)
      })
    },
    30000
  )
})
