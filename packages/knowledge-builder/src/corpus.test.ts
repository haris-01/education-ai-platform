import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveWorkspaceRoot } from '@education-ai/shared'

import { assembleKnowledgeDocument } from './pipeline/assemble-knowledge-document'

// Real Cambridge 0625 June 2024 session — the one session in the Phase 1
// dataset with question paper + mark scheme + examiner report coverage
// for both an MCQ paper (11) and a theory paper (41), so together these
// two cases exercise every enrichment `assembleKnowledgeDocument` wires up.
const WORKSPACE_ROOT = resolveWorkspaceRoot(process.cwd())
const SESSION_ROOT = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj'
)
const SYLLABUS_PDF = path.join(
  WORKSPACE_ROOT,
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'
)
const EXAMINER_REPORT_PDF = path.join(
  SESSION_ROOT,
  '570003-june-2024-examiner-report.pdf'
)
const PAPER_11 = {
  questionPaperPdfPath: path.join(
    SESSION_ROOT,
    '11/570010-june-2024-question-paper-11.pdf'
  ),
  markSchemePdfPath: path.join(
    SESSION_ROOT,
    '11/570004-june-2024-mark-scheme-paper-11.pdf'
  ),
}
const PAPER_41 = {
  questionPaperPdfPath: path.join(
    SESSION_ROOT,
    '41/671385-june-2024-question-paper-41.pdf'
  ),
  markSchemePdfPath: path.join(
    SESSION_ROOT,
    '41/671373-june-2024-mark-scheme-paper-41.pdf'
  ),
}

const datasetAvailable = [
  PAPER_11.questionPaperPdfPath,
  PAPER_11.markSchemePdfPath,
  PAPER_41.questionPaperPdfPath,
  PAPER_41.markSchemePdfPath,
  EXAMINER_REPORT_PDF,
  SYLLABUS_PDF,
].every(existsSync)

describe.skipIf(!datasetAvailable)('knowledge builder corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found under ${WORKSPACE_ROOT}`
    )
  }

  it('assembles paper 11 (MCQ) with every enrichment populated', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_11,
      markSchemeType: 'mcq',
      syllabusPdfPath: SYLLABUS_PDF,
      examinerReportPdfPath: EXAMINER_REPORT_PDF,
      examinerReportPaperCode: '0625/11',
    })

    expect(knowledge.questions).toHaveLength(40)
    expect(knowledge.topics.length).toBeGreaterThan(0)

    const withAnswer = knowledge.questions.filter(
      (q) => q.correctAnswer !== undefined
    )
    const withTopic = knowledge.questions.filter(
      (q) => q.topicNumber !== undefined
    )
    // Every MCQ has an answer in the mark scheme — this must be ~all of
    // them. Topic classification is a best-effort keyword match (see
    // topic-mapping), so only a floor is asserted there.
    expect(
      withAnswer.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.9)
    expect(
      withTopic.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.6)
  }, 30000)

  it('assembles paper 41 (theory) with marking points populated', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
      examinerReportPdfPath: EXAMINER_REPORT_PDF,
      examinerReportPaperCode: '0625/41',
    })

    // Both papers run to at least question 8; a low count would mean the
    // table detector missed most of the pages.
    expect(knowledge.questions.length).toBeGreaterThanOrEqual(8)

    const withMarkingPoints = knowledge.questions.filter(
      (q) => q.markingPoints !== undefined && q.markingPoints.length > 0
    )
    // Theory questions are matched to the mark scheme by their leading
    // question number, so this should cover nearly every question — a
    // low rate would mean the sub-part grouping regressed.
    expect(
      withMarkingPoints.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.8)

    knowledge.questions.forEach((q) => {
      expect(q.correctAnswer).toBeUndefined()
    })
  }, 30000)

  it('carries common mistakes through onto paper 41 (theory)', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
      examinerReportPdfPath: EXAMINER_REPORT_PDF,
      examinerReportPaperCode: '0625/41',
    })

    const withMistakes = knowledge.questions.filter(
      (q) => q.commonMistakes.length > 0
    )
    // Every question on 0625/41 drew some criticism in this session.
    expect(withMistakes.length / knowledge.questions.length).toBeGreaterThan(
      0.7
    )

    // Each mistake must be quotable back to the source commentary.
    knowledge.questions.forEach((q) => {
      q.commonMistakes.forEach((mistake) => {
        expect(q.examinerCommentary?.replace(/\s+/g, ' ')).toContain(
          mistake.replace(/\s+/g, ' ')
        )
      })
    })
  }, 30000)

  it('leaves common mistakes empty when no examiner report is supplied', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
    })

    knowledge.questions.forEach((q) => {
      expect(q.examinerCommentary).toBeUndefined()
      expect(q.commonMistakes).toEqual([])
    })
  }, 30000)

  it('carries the syllabus learning objectives through', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
    })

    // The 0625 subject content is 24 sub-topics; every one must carry at
    // least one section with objectives in it.
    expect(knowledge.subTopics).toHaveLength(24)
    knowledge.subTopics.forEach((subTopic) => {
      expect(subTopic.sections.length).toBeGreaterThan(0)
      subTopic.sections.forEach((section) => {
        expect(section.core.length + section.supplement.length).toBeGreaterThan(
          0
        )
      })
    })
  }, 30000)

  it('carries difficulty through onto paper 41 (theory)', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
      examinerReportPdfPath: EXAMINER_REPORT_PDF,
      examinerReportPaperCode: '0625/41',
    })

    const banded = knowledge.questions.filter((q) => q.difficulty !== undefined)
    expect(banded.length / knowledge.questions.length).toBeGreaterThanOrEqual(
      0.9
    )

    // A paper that came out all one band would mean the rules collapsed.
    const bands = new Set(banded.map((q) => q.difficulty))
    expect(bands.size).toBeGreaterThanOrEqual(2)
  }, 30000)

  it('leaves difficulty undefined when no examiner report is supplied', async () => {
    // Difficulty is grounded in what candidates actually did, so with no
    // report there is nothing to ground it in — it must stay absent
    // rather than fall back to marks, which measure length not demand.
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
    })

    knowledge.questions.forEach((q) => {
      expect(q.difficulty).toBeUndefined()
    })
  }, 30000)

  it('carries assessment objectives through onto paper 41 (theory)', async () => {
    const knowledge = await assembleKnowledgeDocument({
      ...PAPER_41,
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
    })

    const classified = knowledge.questions.filter(
      (q) => q.assessmentObjectives.length > 0
    )

    // Theory papers classify at 92-100% (see assessment-objective-mapping's
    // corpus test); this checks the join carries that through rather than
    // dropping it, not the mapper's own accuracy.
    expect(
      classified.length / knowledge.questions.length
    ).toBeGreaterThanOrEqual(0.9)

    // Papers 1-4 are weighted 0% AO3 by the syllabus.
    knowledge.questions.forEach((q) => {
      expect(q.assessmentObjectives).not.toContain('AO3')
    })

    const withMarks = knowledge.questions.filter(
      (q) => Object.keys(q.marksByAssessmentObjective).length > 0
    )
    expect(withMarks.length).toBeGreaterThan(0)
  }, 30000)

  it('carries AO3 through onto a practical paper', async () => {
    // Paper 61 is the alternative to practical, which the syllabus
    // weights at 100% AO3 — the one case with an exactly known answer.
    const knowledge = await assembleKnowledgeDocument({
      questionPaperPdfPath: path.join(
        SESSION_ROOT,
        '61/671387-june-2024-question-paper-61.pdf'
      ),
      markSchemePdfPath: path.join(
        SESSION_ROOT,
        '61/671375-june-2024-mark-scheme-paper-61.pdf'
      ),
      markSchemeType: 'theory',
      syllabusPdfPath: SYLLABUS_PDF,
    })

    expect(knowledge.questions.length).toBeGreaterThan(0)
    knowledge.questions.forEach((q) => {
      expect(q.assessmentObjectives).toEqual(['AO3'])
      expect(q.primaryAssessmentObjective).toBe('AO3')
    })
  }, 30000)

  it('carries the paper code and full question body through', async () => {
    // Phase 5 embeds a question as one body of text and filters chunks by
    // paper in SQL. Neither is possible from the stem and a title alone,
    // so both are asserted against real papers rather than fixtures.
    const [mcq, theory] = await Promise.all([
      assembleKnowledgeDocument({
        ...PAPER_11,
        markSchemeType: 'mcq',
        syllabusPdfPath: SYLLABUS_PDF,
      }),
      assembleKnowledgeDocument({
        ...PAPER_41,
        markSchemeType: 'theory',
        syllabusPdfPath: SYLLABUS_PDF,
      }),
    ])

    expect(mcq.metadata.paper?.code).toBe('11')
    expect(theory.metadata.paper?.code).toBe('41')
    expect(theory.metadata.paper?.syllabusCode).toBe('0625')

    // Paper 11 is multiple choice: options, no parts.
    const withOptions = mcq.questions.filter((q) => q.options.length > 0)
    expect(withOptions.length / mcq.questions.length).toBeGreaterThanOrEqual(
      0.8
    )
    mcq.questions.forEach((q) => {
      expect(q.parts).toEqual([])
    })

    // Paper 41 is theory: parts, no options. Most of its text lives in
    // those parts, which is the whole reason they had to be carried.
    const withParts = theory.questions.filter((q) => q.parts.length > 0)
    expect(withParts.length / theory.questions.length).toBeGreaterThanOrEqual(
      0.8
    )
    theory.questions.forEach((q) => {
      expect(q.options).toEqual([])
    })

    const partText = theory.questions
      .flatMap((q) => q.parts)
      .reduce((total, p) => total + p.text.length, 0)
    const stemText = theory.questions.reduce(
      (total, q) => total + q.text.length,
      0
    )
    expect(partText).toBeGreaterThan(stemText)
  }, 60000)
})
