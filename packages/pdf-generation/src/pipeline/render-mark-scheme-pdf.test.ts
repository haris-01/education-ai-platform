import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import type { GeneratedPaper } from '@education-ai/exam-generation'

import { renderMarkSchemePdf } from './render-mark-scheme-pdf'
import { renderPaperPdf } from './render-paper-pdf'

const PAPER: GeneratedPaper = {
  syllabusCode: '0625',
  title: 'IGCSE Physics 0625 — generated paper',
  totalMarks: 9,
  questions: [
    {
      questionNumber: 1,
      topicNumber: 1,
      text: 'A trolley of mass 2.0 kg rolls down a ramp.',
      parts: [
        {
          label: 'a',
          text: 'State the equation linking force and acceleration.',
          marks: 3,
          markScheme: [
            { text: 'force equals mass times acceleration', marks: 3 },
          ],
        },
      ],
      options: [],
      marks: 3,
      assessmentObjective: 'AO1',
      difficulty: 'low',
      markScheme: [],
      requiresDiagram: false,
      sourceChunkIds: [],
    },
    {
      questionNumber: 2,
      topicNumber: 3,
      text: 'Which way does light bend entering glass?',
      parts: [],
      options: [
        { label: 'A', text: 'toward the normal', correct: true },
        { label: 'B', text: 'away from the normal', correct: false },
      ],
      marks: 1,
      assessmentObjective: 'AO1',
      difficulty: 'low',
      markScheme: [{ text: 'A', marks: 1 }],
      requiresDiagram: false,
      sourceChunkIds: [],
    },
    {
      questionNumber: 3,
      topicNumber: 5,
      text: 'Explain what is meant by the half-life of an isotope.',
      parts: [],
      options: [],
      marks: 5,
      assessmentObjective: 'AO2',
      difficulty: 'high',
      markScheme: [
        { text: 'time for half the nuclei to decay', marks: 3 },
        { text: 'independent of the starting quantity', marks: 2 },
      ],
      requiresDiagram: false,
      sourceChunkIds: [],
    },
  ],
  generatorModel: 'fake-generator',
  generatedAt: new Date('2024-06-01T00:00:00Z'),
}

async function textOf(bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ms-pdf-'))
  const file = path.join(directory, 'doc.pdf')
  await writeFile(file, bytes)
  const parsed = await parseNativePdf(file)

  return parsed.pages
    .flatMap((page) => page.textElements.map((element) => element.text))
    .join(' ')
    .replace(/\s+/g, ' ')
}

describe('renderMarkSchemePdf', () => {
  it('prints every mark point with its marks', async () => {
    const text = await textOf(await renderMarkSchemePdf(PAPER))

    expect(text).toContain('force equals mass times acceleration')
    expect(text).toContain('time for half the nuclei to decay')
    expect(text).toContain('independent of the starting quantity')
    expect(text).toContain('[3]')
    expect(text).toContain('[2]')
  }, 30000)

  it('states the correct option for a multiple-choice question', async () => {
    const text = await textOf(await renderMarkSchemePdf(PAPER))

    expect(text).toContain('Answer: A')
  }, 30000)

  it('carries the marker-facing metadata the paper must not show', async () => {
    // Printing difficulty for candidates would tell them how hard a
    // question is meant to be before they attempt it.
    const markScheme = await textOf(await renderMarkSchemePdf(PAPER))
    const paper = await textOf(await renderPaperPdf(PAPER))

    expect(markScheme).toContain('AO2')
    expect(markScheme).toContain('high')
    expect(paper).not.toContain('AO2')
  }, 60000)

  it('is a separate document from the paper, so neither leaks into the other', async () => {
    const markScheme = await textOf(await renderMarkSchemePdf(PAPER))
    const paper = await textOf(await renderPaperPdf(PAPER))

    expect(paper).not.toContain('time for half the nuclei to decay')
    expect(markScheme).toContain('mark scheme')
  }, 60000)

  it('handles a paper whose questions have no mark scheme at all', async () => {
    const empty = {
      ...PAPER,
      questions: [{ ...PAPER.questions[2], markScheme: [] }],
    }

    await expect(renderMarkSchemePdf(empty)).resolves.toBeInstanceOf(Uint8Array)
  }, 30000)
})
