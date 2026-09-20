import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseNativePdf } from '@education-ai/document-ai'
import type {
  GeneratedPaper,
  GeneratedQuestion,
} from '@education-ai/exam-generation'

import { createFakeDiagramGenerator } from '@education-ai/diagram-generation'

import { renderPaperPdf } from './render-paper-pdf'

function question(
  questionNumber: number,
  overrides: Partial<GeneratedQuestion> = {}
): GeneratedQuestion {
  return {
    questionNumber,
    topicNumber: 1,
    text: `A trolley of mass ${questionNumber}.0 kg rolls down a ramp.`,
    parts: [],
    options: [],
    marks: 4,
    assessmentObjective: 'AO1',
    difficulty: 'moderate',
    markScheme: [{ text: 'the expected answer', marks: 4 }],
    requiresDiagram: false,
    sourceChunkIds: [],
    ...overrides,
  }
}

function paper(questions: GeneratedQuestion[]): GeneratedPaper {
  return {
    syllabusCode: '0625',
    title: 'IGCSE Physics 0625 — generated paper',
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    questions,
    generatorModel: 'fake-generator',
    generatedAt: new Date('2024-06-01T00:00:00Z'),
  }
}

// Written to disk and read back through this project's own Phase 2
// parser. Asserting on bytes would only prove pdfkit ran; parsing the
// result proves the text a candidate would read is actually in there,
// using the same code that reads real Cambridge papers.
async function renderAndParse(document: GeneratedPaper) {
  const bytes = await renderPaperPdf(document)
  const directory = await mkdtemp(path.join(tmpdir(), 'paper-pdf-'))
  const file = path.join(directory, 'paper.pdf')

  await writeFile(file, bytes)

  return { bytes, parsed: await parseNativePdf(file) }
}

function allText(parsed: Awaited<ReturnType<typeof parseNativePdf>>): string {
  return parsed.pages
    .flatMap((page) => page.textElements.map((element) => element.text))
    .join(' ')
    .replace(/\s+/g, ' ')
}

describe('renderPaperPdf', () => {
  it('produces a PDF our own parser can read', async () => {
    const { bytes, parsed } = await renderAndParse(paper([question(1)]))

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(parsed.pages.length).toBeGreaterThan(0)
  }, 30000)

  it('prints the title, syllabus and total marks on the cover', async () => {
    const { parsed } = await renderAndParse(paper([question(1), question(2)]))
    const text = allText(parsed)

    expect(text).toContain('IGCSE Physics 0625')
    expect(text).toContain('Syllabus 0625')
    expect(text).toContain('The total mark for this paper is 8')
    expect(text).toContain('There are 2 questions')
  }, 30000)

  it('prints every question, numbered, with its marks', async () => {
    const { parsed } = await renderAndParse(
      paper([question(1), question(2), question(3)])
    )
    const text = allText(parsed)

    expect(text).toContain('A trolley of mass 1.0 kg rolls down a ramp.')
    expect(text).toContain('A trolley of mass 3.0 kg rolls down a ramp.')
    expect(text).toContain('[4]')
  }, 30000)

  it('prints sub-parts with their own labels and marks', async () => {
    const { parsed } = await renderAndParse(
      paper([
        question(1, {
          marks: 7,
          parts: [
            {
              label: 'a',
              text: 'State the equation linking force and acceleration.',
              marks: 3,
              markScheme: [{ text: 'F = ma', marks: 3 }],
            },
            {
              label: 'b',
              text: 'Calculate the acceleration of the trolley.',
              marks: 4,
              markScheme: [{ text: '2.5 m/s2', marks: 4 }],
            },
          ],
        }),
      ])
    )
    const text = allText(parsed)

    expect(text).toContain('(a)')
    expect(text).toContain('State the equation linking force and acceleration.')
    expect(text).toContain('(b)')
    expect(text).toContain('[3]')
  }, 30000)

  it('prints multiple-choice options', async () => {
    const { parsed } = await renderAndParse(
      paper([
        question(1, {
          marks: 1,
          options: [
            { label: 'A', text: 'toward the normal', correct: true },
            { label: 'B', text: 'away from the normal', correct: false },
          ],
        }),
      ])
    )
    const text = allText(parsed)

    expect(text).toContain('toward the normal')
    expect(text).toContain('away from the normal')
  }, 30000)

  it('never prints which option is correct', async () => {
    // A question paper that gives away its answers is not a question
    // paper. The flag exists for the mark scheme, not for this.
    const { parsed } = await renderAndParse(
      paper([
        question(1, {
          marks: 1,
          options: [
            { label: 'A', text: 'toward the normal', correct: true },
            { label: 'B', text: 'away from the normal', correct: false },
          ],
        }),
      ])
    )
    const text = allText(parsed).toLowerCase()

    expect(text).not.toContain('correct: true')
    expect(text).not.toContain('the expected answer')
  }, 30000)

  it('never prints the mark scheme on the question paper', async () => {
    const { parsed } = await renderAndParse(paper([question(1)]))

    expect(allText(parsed)).not.toContain('the expected answer')
  }, 30000)

  it('reserves space and states the brief for a question needing a figure', async () => {
    // Until Phase 8 draws it, the paper should be honest about what is
    // missing rather than referring to a figure that is not there.
    const { parsed } = await renderAndParse(
      paper([
        question(1, {
          requiresDiagram: true,
          diagramBrief: 'A trolley on a ramp inclined at 30 degrees.',
        }),
      ])
    )

    expect(allText(parsed)).toContain(
      'A trolley on a ramp inclined at 30 degrees.'
    )
  }, 30000)

  it('draws a supplied figure as vectors, with its label', async () => {
    // Generated as SVG precisely so it prints at the printer's
    // resolution and keeps its labels as real text.
    const diagram = await createFakeDiagramGenerator().generate({
      label: 'Fig. 1.1',
      brief: 'A trolley on a ramp.',
    })

    const bytes = await renderPaperPdf(
      paper([
        question(1, {
          requiresDiagram: true,
          diagramBrief: 'A trolley on a ramp.',
        }),
      ]),
      { diagrams: new Map([[1, diagram]]) }
    )

    const directory = await mkdtemp(path.join(tmpdir(), 'paper-pdf-'))
    const file = path.join(directory, 'paper.pdf')
    await writeFile(file, bytes)
    const parsed = await parseNativePdf(file)
    const text = allText(parsed)

    expect(text).toContain('Fig. 1.1')
    // The brief is the fallback for a figure that was not drawn; once
    // one is, printing it too would caption the picture with its own
    // instructions.
    expect(text).not.toContain('Figure: A trolley on a ramp.')
  }, 30000)

  it('falls back to the brief when no figure was drawn for that question', async () => {
    const { parsed } = await renderAndParse(
      paper([
        question(1, {
          requiresDiagram: true,
          diagramBrief: 'A trolley on a ramp.',
        }),
        question(2, {
          requiresDiagram: true,
          diagramBrief: 'A ray entering glass.',
        }),
      ])
    )

    expect(allText(parsed)).toContain('Figure: A ray entering glass.')
  }, 30000)

  it('runs onto further pages rather than overflowing one', async () => {
    const many = Array.from({ length: 12 }, (_u, i) => question(i + 1))
    const { parsed } = await renderAndParse(paper(many))

    expect(parsed.pages.length).toBeGreaterThan(2)
    expect(allText(parsed)).toContain('A trolley of mass 12.0 kg')
  }, 60000)

  it('carries the paper title into the PDF metadata', async () => {
    // So the title shows in a file manager and a browser tab, not only
    // on the printed page. PDF Info strings are UTF-16BE with a BOM, so
    // searching the bytes as latin1 finds nothing — which is what the
    // first version of this test did.
    const bytes = await renderPaperPdf(paper([question(1)]))
    const utf16 = Buffer.from(bytes).includes(
      Buffer.from('IGCSE Physics 0625', 'utf16le').swap16()
    )

    expect(utf16).toBe(true)
  }, 30000)
})
