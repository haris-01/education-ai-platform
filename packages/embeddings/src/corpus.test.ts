import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import type { KnowledgeDocument } from '@education-ai/knowledge-builder'
import { assembleKnowledgeDocument } from '@education-ai/knowledge-builder'
import { resolveWorkspaceRoot } from '@education-ai/shared'

import { chunkExaminerInsights } from './chunking/chunk-examiner-insights'
import { chunkLearningObjectives } from './chunking/chunk-learning-objectives'
import { chunkQuestions } from './chunking/chunk-questions'
import { createFakeEmbedder } from './embedders/fake-embedder'
import { buildEmbeddingDocument } from './pipeline/build-embedding-document'

// Real Cambridge 0625 June 2024 session — same two papers the
// knowledge-builder corpus test uses, so this measures the chunkers
// rather than a second dataset. 11 is multiple choice, 41 is theory.
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
const SYLLABUS_RESOURCE_ID = 'CAM-0625-SYLLABUS-2023-2025'

const PAPER_11 = {
  questionPaperPdfPath: path.join(
    SESSION_ROOT,
    '11/570010-june-2024-question-paper-11.pdf'
  ),
  markSchemePdfPath: path.join(
    SESSION_ROOT,
    '11/570004-june-2024-mark-scheme-paper-11.pdf'
  ),
  markSchemeType: 'mcq' as const,
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
  markSchemeType: 'theory' as const,
}

const datasetAvailable = [
  PAPER_11.questionPaperPdfPath,
  PAPER_11.markSchemePdfPath,
  PAPER_41.questionPaperPdfPath,
  PAPER_41.markSchemePdfPath,
  EXAMINER_REPORT_PDF,
  SYLLABUS_PDF,
].every(existsSync)

describe.skipIf(!datasetAvailable)('embeddings corpus', () => {
  if (!datasetAvailable) {
    console.info(
      `[corpus.test] skipped — dataset not found under ${WORKSPACE_ROOT}`
    )
  }

  let mcq: KnowledgeDocument
  let theory: KnowledgeDocument

  beforeAll(async () => {
    // 60s, not the 30s the per-test cases use: this assembles two whole
    // knowledge documents, each parsing a question paper, a mark scheme,
    // the syllabus and the 60-page examiner report, and a hook that
    // times out fails the whole suite rather than one case.
    ;[mcq, theory] = await Promise.all([
      assembleKnowledgeDocument({
        ...PAPER_11,
        syllabusPdfPath: SYLLABUS_PDF,
        examinerReportPdfPath: EXAMINER_REPORT_PDF,
        examinerReportPaperCode: '0625/11',
      }),
      assembleKnowledgeDocument({
        ...PAPER_41,
        syllabusPdfPath: SYLLABUS_PDF,
        examinerReportPdfPath: EXAMINER_REPORT_PDF,
        examinerReportPaperCode: '0625/41',
      }),
    ])
  }, 60000)

  it('chunks every question on both papers exactly once', () => {
    expect(chunkQuestions(mcq)).toHaveLength(mcq.questions.length)
    expect(chunkQuestions(theory)).toHaveLength(theory.questions.length)
    expect(chunkQuestions(mcq)).toHaveLength(40)
  })

  it('embeds substantially more of a theory question than its stem', () => {
    // The reason parts had to be carried into KnowledgeDocument at all.
    const chunks = chunkQuestions(theory)
    const embedded = chunks.reduce((total, c) => total + c.content.length, 0)
    const stems = theory.questions.reduce(
      (total, q) => total + q.text.length,
      0
    )

    expect(embedded).toBeGreaterThan(stems * 1.5)
  })

  it('gives every chunk a unique id across all three types', () => {
    const chunks = [
      ...chunkQuestions(mcq),
      ...chunkQuestions(theory),
      ...chunkExaminerInsights(mcq),
      ...chunkExaminerInsights(theory),
      ...chunkLearningObjectives(theory, SYLLABUS_RESOURCE_ID),
    ]

    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length)
  })

  it('never embeds an empty or header-only chunk', () => {
    const chunks = [
      ...chunkQuestions(mcq),
      ...chunkQuestions(theory),
      ...chunkExaminerInsights(theory),
      ...chunkLearningObjectives(theory, SYLLABUS_RESOURCE_ID),
    ]

    chunks.forEach((chunk) => {
      const body = chunk.content.split('\n\n').slice(1).join('\n\n')
      expect(body.trim().length).toBeGreaterThan(0)
      expect(chunk.content).not.toContain('undefined')
    })
  })

  it('chunks the whole syllabus, and identically from either paper', () => {
    const fromTheory = chunkLearningObjectives(theory, SYLLABUS_RESOURCE_ID)
    const fromMcq = chunkLearningObjectives(mcq, SYLLABUS_RESOURCE_ID)

    // The 0625 subject content runs to 324 objectives (see Phase 4).
    expect(fromTheory.length).toBeGreaterThan(300)
    expect(fromTheory.map((c) => c.contentHash)).toEqual(
      fromMcq.map((c) => c.contentHash)
    )
  })

  it('quotes examiner commentary verbatim into its chunk', () => {
    const chunks = chunkExaminerInsights(theory)

    expect(chunks.length).toBeGreaterThan(0)
    chunks.forEach((chunk) => {
      const commentary = chunk.payload.examinerCommentary ?? ''
      expect(normalise(chunk.content)).toContain(normalise(commentary))
    })
  })

  it('produces far fewer insight chunks on the multiple-choice paper', () => {
    // The examiner report only discusses the notable multiple-choice
    // questions. That ceiling is the source's, not the chunker's, and it
    // is reported rather than padded out with empty chunks.
    const mcqInsights = chunkExaminerInsights(mcq)
    const theoryInsights = chunkExaminerInsights(theory)

    expect(mcqInsights.length / mcq.questions.length).toBeLessThan(
      theoryInsights.length / theory.questions.length
    )
  })

  it('carries a paper code onto every question chunk', () => {
    chunkQuestions(theory).forEach((chunk) => {
      expect(chunk.metadata.syllabusCode).toBe('0625')
      expect(chunk.metadata.paperCode).toBe('41')
    })
  })

  it('builds an embedding document over the whole paper', async () => {
    const chunks = [...chunkQuestions(theory), ...chunkExaminerInsights(theory)]
    const embedder = createFakeEmbedder(768)

    const document = await buildEmbeddingDocument({
      resourceId: theory.metadata.resourceId,
      title: theory.metadata.title,
      chunks,
      embedder,
    })

    expect(document.chunks).toHaveLength(chunks.length)
    document.chunks.forEach((chunk) => {
      expect(chunk.embedding).toHaveLength(768)
    })
  }, 30000)
})

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
