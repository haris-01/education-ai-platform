import PDFDocument from 'pdfkit'

import type {
  GeneratedPaper,
  GeneratedQuestion,
  GeneratedSubPart,
} from '@education-ai/exam-generation'

import {
  CONTENT_WIDTH,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MARKS_COLUMN_WIDTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from '../layout/page-metrics'

// Renders the mark scheme for a generated paper.
//
// A separate document rather than a section of the paper, because that
// is how boards publish them and because the two have opposite
// audiences: one must not reveal the answers and the other is nothing
// but answers. Keeping them in one file would make "send the paper to
// candidates" a redaction problem.
export async function renderMarkSchemePdf(
  paper: GeneratedPaper
): Promise<Uint8Array> {
  const document = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margins: {
      top: MARGIN_TOP,
      bottom: MARGIN_BOTTOM,
      left: MARGIN_LEFT,
      right: MARGIN_RIGHT,
    },
    autoFirstPage: false,
    info: {
      Title: `${paper.title} — mark scheme`,
      Subject: `Syllabus ${paper.syllabusCode}`,
      Creator: paper.generatorModel,
      CreationDate: paper.generatedAt,
    },
  })

  const bytes = collect(document)

  document.addPage()
  document
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(`${paper.title} — mark scheme`, { align: 'center' })
    .moveDown(0.3)
  document
    .font('Helvetica')
    .fontSize(11)
    .text(`Syllabus ${paper.syllabusCode}  •  ${paper.totalMarks} marks`, {
      align: 'center',
    })
    .moveDown(1.2)

  paper.questions.forEach((question) => drawQuestion(document, question))

  document.end()

  return bytes
}

function collect(document: PDFKit.PDFDocument): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
  })
}

function drawQuestion(
  document: PDFKit.PDFDocument,
  question: GeneratedQuestion
): void {
  ensureSpace(document, 70)

  document
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(
      `${question.questionNumber}   ${truncate(question.text)}`,
      MARGIN_LEFT,
      document.y,
      { width: CONTENT_WIDTH + MARKS_COLUMN_WIDTH }
    )

  // The assessment objective and difficulty belong here rather than on
  // the paper: they are information for whoever is marking or
  // moderating, and printing them for candidates would tell them how
  // hard the question is meant to be before they attempt it.
  document
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor('#666666')
    .text(
      `topic ${question.topicNumber}  •  ${question.assessmentObjective}  •  ${question.difficulty}`,
      { width: CONTENT_WIDTH }
    )
    .fillColor('black')

  if (question.options.length > 0) {
    const answer = question.options.find((option) => option.correct)

    document
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`Answer: ${answer?.label ?? '(none marked correct)'}`, {
        indent: 18,
      })
      .font('Helvetica')
  }

  question.markScheme.forEach((point) => drawMarkPoint(document, point, 0))
  question.parts.forEach((part) => drawPart(document, part, 0))

  document.moveDown(0.8)
}

function drawPart(
  document: PDFKit.PDFDocument,
  part: GeneratedSubPart,
  depth: number
): void {
  ensureSpace(document, 40)

  const indent = 18 + depth * 18

  document
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(`(${part.label})   ${truncate(part.text)}`, { indent })
    .font('Helvetica')

  part.markScheme.forEach((point) => drawMarkPoint(document, point, depth + 1))
  ;(part.subParts ?? []).forEach((child) =>
    drawPart(document, child, depth + 1)
  )
}

function drawMarkPoint(
  document: PDFKit.PDFDocument,
  point: { text: string; marks: number },
  depth: number
): void {
  ensureSpace(document, 24)

  const y = document.y

  document
    .font('Helvetica')
    .fontSize(10)
    .text(point.text, MARGIN_LEFT + 24 + depth * 18, y, {
      width: CONTENT_WIDTH - depth * 18,
    })

  document
    .fontSize(10)
    .text(
      `[${point.marks}]`,
      PAGE_WIDTH - MARGIN_RIGHT - MARKS_COLUMN_WIDTH,
      y,
      { width: MARKS_COLUMN_WIDTH, align: 'right' }
    )
}

// The stem is reproduced only far enough to find the question. A mark
// scheme is read beside the paper, so repeating it in full wastes the
// page a marker is scanning.
function truncate(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim()

  if (flattened.length <= 90) {
    return flattened
  }

  return `${flattened.slice(0, 90)}…`
}

function ensureSpace(document: PDFKit.PDFDocument, needed: number): void {
  if (document.y + needed < PAGE_HEIGHT - MARGIN_BOTTOM) {
    return
  }

  document.addPage()
}
