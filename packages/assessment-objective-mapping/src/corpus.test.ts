import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { buildQuestionDocument } from '@education-ai/question-extraction'
import { resolveWorkspaceRoot } from '@education-ai/shared'
import type { SyllabusOverview } from '@education-ai/syllabus-extraction'
import { buildSyllabusOverview } from '@education-ai/syllabus-extraction'

import { assignAssessmentObjectives } from './pipeline/assign-assessment-objectives'

// Real Cambridge 0625 papers — gitignored, same reasoning as the other
// corpus tests in this monorepo. Skips itself when the dataset is absent.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const DATASET_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625'
)
const SYLLABUS_PDF = path.join(
  DATASET_ROOT,
  'syllabus/595430-2023-2025-syllabus.pdf'
)

const MULTIPLE_CHOICE_PAPERS = [
  'specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf',
  'specimen-papers/2023/2/595784-2023-specimen-paper-2.pdf',
  'past-papers/2024/mj/11/570010-june-2024-question-paper-11.pdf',
  'past-papers/2024/mj/21/570011-june-2024-question-paper-21.pdf',
]

const THEORY_PAPERS = [
  'specimen-papers/2023/3/595785-2023-specimen-paper-3.pdf',
  'specimen-papers/2023/4/595786-2023-specimen-paper-4.pdf',
  'past-papers/2024/mj/31/570012-june-2024-question-paper-31.pdf',
  'past-papers/2024/mj/41/671385-june-2024-question-paper-41.pdf',
]

const PRACTICAL_PAPERS = [
  'specimen-papers/2023/5/595788-2023-specimen-paper-5.pdf',
  'specimen-papers/2023/6/595789-2023-specimen-paper-6.pdf',
  'past-papers/2024/mj/51/671386-june-2024-question-paper-51.pdf',
  'past-papers/2024/mj/61/671387-june-2024-question-paper-61.pdf',
]

const datasetAvailable = existsSync(DATASET_ROOT)

describe.skipIf(!datasetAvailable)('assessment objective corpus', () => {
  if (!datasetAvailable) {
    console.info(`[corpus.test] skipped — dataset not found at ${DATASET_ROOT}`)
  }

  let syllabus: SyllabusOverview

  beforeAll(async () => {
    syllabus = buildSyllabusOverview(await parseNativePdf(SYLLABUS_PDF))
    // 60s, not the 30s the per-test cases use: a hook that times out
    // fails the whole suite rather than one case.
  }, 60000)

  async function assignmentsFor(relativePath: string) {
    const parsed = await parseNativePdf(path.join(DATASET_ROOT, relativePath))
    const questionDocument = buildQuestionDocument(parsed)
    return assignAssessmentObjectives(questionDocument, syllabus).assignments
  }

  it.each(PRACTICAL_PAPERS)(
    'assigns AO3 to every question on practical paper %s',
    async (relativePath) => {
      // The syllabus states papers 5 and 6 are 100% AO3, so this is the
      // one case with a known-exact answer to check against.
      const assignments = await assignmentsFor(relativePath)

      expect(assignments.length).toBeGreaterThan(0)
      assignments.forEach((assignment) => {
        expect(assignment.objectives).toEqual(['AO3'])
        expect(assignment.primaryObjective).toBe('AO3')
      })
    },
    30000
  )

  it.each(THEORY_PAPERS)(
    'classifies at least 90%% of questions on theory paper %s',
    async (relativePath) => {
      const assignments = await assignmentsFor(relativePath)
      const classified = assignments.filter((a) => a.objectives.length > 0)

      // Measured at 92-100% across all four. The floor guards against a
      // regression in command-word matching without pinning an exact
      // number that ordinary wording changes would break.
      expect(classified.length / assignments.length).toBeGreaterThanOrEqual(0.9)
    },
    30000
  )

  it.each(THEORY_PAPERS)(
    'never assigns AO3 on theory paper %s',
    async (relativePath) => {
      // Papers 1-4 are weighted 0% AO3 by the syllabus.
      const assignments = await assignmentsFor(relativePath)

      assignments.forEach((assignment) => {
        expect(assignment.objectives).not.toContain('AO3')
      })
    },
    30000
  )

  it.each(THEORY_PAPERS)(
    'finds both AO1 and AO2 somewhere on theory paper %s',
    async (relativePath) => {
      // The syllabus weights papers 3 and 4 at 63% AO1 / 37% AO2, so a
      // paper that produced only one of them would mean the command-word
      // table had collapsed to a single objective.
      const assignments = await assignmentsFor(relativePath)
      const codes = new Set(assignments.flatMap((a) => a.objectives))

      expect([...codes].sort()).toEqual(['AO1', 'AO2'])
    },
    30000
  )

  it.each(MULTIPLE_CHOICE_PAPERS)(
    'only ever claims AO2 on multiple-choice paper %s',
    async (relativePath) => {
      // MCQ questions carry no command word, so the only signal available
      // is a fully numeric option list, which means AO2. Coverage is low
      // by design (15-28% measured) — the rest are left unclassified
      // rather than defaulted to AO1. See the package's known limitation.
      const assignments = await assignmentsFor(relativePath)
      const classified = assignments.filter((a) => a.objectives.length > 0)

      expect(classified.length).toBeGreaterThan(0)
      classified.forEach((assignment) => {
        expect(assignment.objectives).toEqual(['AO2'])
        expect(assignment.evidence[0].signal).toBe('quantitative-options')
      })
    },
    30000
  )

  it.each([...MULTIPLE_CHOICE_PAPERS, ...THEORY_PAPERS, ...PRACTICAL_PAPERS])(
    'returns one assignment per question for %s',
    async (relativePath) => {
      const parsed = await parseNativePdf(path.join(DATASET_ROOT, relativePath))
      const questionDocument = buildQuestionDocument(parsed)
      const { assignments } = assignAssessmentObjectives(
        questionDocument,
        syllabus
      )

      expect(assignments.map((a) => a.questionNumber)).toEqual(
        questionDocument.questions.map((q) => q.number)
      )
    },
    30000
  )
})
