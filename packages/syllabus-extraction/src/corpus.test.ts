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
    console.info(`[corpus.test] skipped — dataset not found at ${DATASET_ROOT}`)
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

  it.each(SYLLABUSES)(
    'extracts the command-word glossary from %s',
    async (fileName) => {
      const filePath = path.join(DATASET_ROOT, fileName)
      const parsed = await parseNativePdf(filePath)
      const { commandWords } = buildSyllabusOverview(parsed)

      // The published table for 0625. Asserting the exact set, not just a
      // count, because this glossary is what assessment-objective mapping
      // keys off — a silently truncated table would degrade every AO
      // assignment downstream rather than fail loudly.
      expect(commandWords.map((c) => c.word)).toEqual([
        'Calculate',
        'Comment',
        'Compare',
        'Deduce',
        'Define',
        'Describe',
        'Determine',
        'Explain',
        'Give',
        'Identify',
        'Justify',
        'Predict',
        'Sketch',
        'State',
        'Suggest',
      ])

      commandWords.forEach((entry) => {
        expect(entry.meaning.length).toBeGreaterThan(0)
        // No meaning should have swallowed the next row's command word.
        expect(entry.meaning).not.toMatch(/\s[A-Z][a-z]+\s+(give|work|make)\b/)
      })

      // "Explain" and "Suggest" wrap onto a second line in the PDF, so they
      // exercise the continuation-joining path.
      const explain = commandWords.find((c) => c.word === 'Explain')
      expect(explain?.meaning).toContain('support with relevant evidence')
    },
    30000
  )

  it.each(SYLLABUSES)(
    'extracts the full subject-content hierarchy from %s',
    async (fileName) => {
      const filePath = path.join(DATASET_ROOT, fileName)
      const parsed = await parseNativePdf(filePath)
      const { subTopics, topics } = buildSyllabusOverview(parsed)

      // The 0625 subject content is 24 sub-topics across the 6 topics:
      // 1.1-1.8, 2.1-2.3, 3.1-3.4, 4.1-4.5, 5.1-5.2, 6.1-6.2. Asserting
      // the exact list, because a heading silently missed or duplicated
      // is the failure mode this extractor is most prone to.
      expect(subTopics.map((s) => s.number)).toEqual([
        '1.1',
        '1.2',
        '1.3',
        '1.4',
        '1.5',
        '1.6',
        '1.7',
        '1.8',
        '2.1',
        '2.2',
        '2.3',
        '3.1',
        '3.2',
        '3.3',
        '3.4',
        '4.1',
        '4.2',
        '4.3',
        '4.4',
        '4.5',
        '5.1',
        '5.2',
        '6.1',
        '6.2',
      ])

      // Every sub-topic belongs to a topic that was actually extracted,
      // and carries at least one section with at least one objective.
      const topicNumbers = new Set(topics.map((t) => t.number))
      subTopics.forEach((subTopic) => {
        expect(topicNumbers.has(subTopic.topicNumber)).toBe(true)
        expect(subTopic.name.length).toBeGreaterThan(0)
        expect(subTopic.sections.length).toBeGreaterThan(0)

        subTopic.sections.forEach((section) => {
          expect(section.number.startsWith(subTopic.number)).toBe(true)
          expect(
            section.core.length + section.supplement.length
          ).toBeGreaterThan(0)
        })
      })
    },
    30000
  )

  it.each(SYLLABUSES)(
    'numbers Core and Supplement objectives as one sequence in %s',
    async (fileName) => {
      const filePath = path.join(DATASET_ROOT, fileName)
      const parsed = await parseNativePdf(filePath)
      const { subTopics } = buildSyllabusOverview(parsed)

      subTopics
        .flatMap((subTopic) => subTopic.sections)
        .forEach((section) => {
          // Cambridge numbers a section's objectives continuously, Core
          // first and Supplement carrying on from where Core stopped. A
          // Supplement item numbered at or below the last Core one would
          // mean the two columns had been mixed up.
          const lastCore = section.core[section.core.length - 1]?.number ?? 0
          section.supplement.forEach((objective) => {
            expect(objective.number).toBeGreaterThan(lastCore)
          })

          // Numbering that restarts mid-section means a heading was
          // missed and two sections were folded into one.
          const coreNumbers = section.core.map((o) => o.number)
          expect(coreNumbers).toEqual([...coreNumbers].sort((a, b) => a - b))
          expect(new Set(coreNumbers).size).toBe(coreNumbers.length)
        })
    },
    30000
  )

  it('does not collect the page footer as a learning objective', async () => {
    // Regression: the footer begins with the page number ("10
    // www.cambridgeinternational.org/igcse Back to contents page") and so
    // matches the objective pattern exactly.
    const filePath = path.join(DATASET_ROOT, SYLLABUSES[0])
    const parsed = await parseNativePdf(filePath)
    const { subTopics } = buildSyllabusOverview(parsed)

    subTopics
      .flatMap((s) => s.sections)
      .flatMap((s) => [...s.core, ...s.supplement])
      .forEach((objective) => {
        expect(objective.text).not.toContain('cambridgeinternational.org')
        expect(objective.text).not.toContain('Back to contents page')
        // A heading reprinted after a page break carries this suffix; it
        // must be stripped, not folded into an objective's text.
        expect(objective.text).not.toMatch(/\bcontinued$/)
      })
  }, 30000)

  it('keeps the two columns apart on a page where they collide', async () => {
    // Sub-topic 1.2's Core item 3 and Supplement item 9 sit at the same
    // height. Reconstructing lines across the full page width produced
    // "Recall and use the equation 9 Define acceleration as change in
    // velocity per unit" — one nonsense objective spanning both columns.
    const filePath = path.join(DATASET_ROOT, SYLLABUSES[0])
    const parsed = await parseNativePdf(filePath)
    const { subTopics } = buildSyllabusOverview(parsed)

    const motion = subTopics.find((s) => s.number === '1.2')
    expect(motion?.name).toBe('Motion')

    // 1.2 has no numbered sections, so its objectives sit in the single
    // implicit section.
    const section = motion?.sections[0]

    const coreThree = section?.core.find((o) => o.number === 3)
    expect(coreThree?.text).toContain('Recall and use the equation')
    expect(coreThree?.text).not.toContain('Define acceleration')

    const supplementNine = section?.supplement.find((o) => o.number === 9)
    expect(supplementNine?.text).toContain('Define acceleration')
  }, 30000)
})
