import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import { resolveWorkspaceRoot } from '@education-ai/shared'

import { buildSyllabusOverview } from './pipeline/build-syllabus-overview'

// Real Cambridge 0625 syllabus documents — gitignored, same reasoning as
// the other corpus tests in this monorepo. Skips itself when the dataset
// isn't present.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const DATASET_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/syllabus'
)

// Only the full syllabus documents — the "-update" files are short
// errata addenda with a different structure, not full syllabi.
const SYLLABUSES = [
  '595430-2023-2025-syllabus.pdf',
  '697209-2026-2028-syllabus.pdf',
]

const EXPECTED_TOPICS = [
  'Motion, forces and energy',
  'Thermal physics',
  'Waves',
  'Electricity and magnetism',
  'Nuclear physics',
  'Space physics',
]

const datasetAvailable = existsSync(DATASET_ROOT)

describe.skipIf(!datasetAvailable)('syllabus corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found at ${DATASET_ROOT}`
    )
  }

  it.each(SYLLABUSES)(
    'extracts all 6 topics and 3 assessment objectives from %s',
    async (fileName) => {
      const filePath = path.join(DATASET_ROOT, fileName)
      const parsed = await parseNativePdf(filePath)
      const overview = buildSyllabusOverview(parsed)

      expect(overview.topics.map((t) => t.name)).toEqual(EXPECTED_TOPICS)

      expect(overview.assessmentObjectives).toHaveLength(3)
      overview.assessmentObjectives.forEach((ao) => {
        expect(ao.description.length).toBeGreaterThan(0)
        expect(ao.weightingPercent).toBeGreaterThan(0)
      })
      const totalWeighting = overview.assessmentObjectives.reduce(
        (sum, ao) => sum + (ao.weightingPercent ?? 0),
        0
      )
      expect(totalWeighting).toBe(100)
    },
    30000
  )
})
