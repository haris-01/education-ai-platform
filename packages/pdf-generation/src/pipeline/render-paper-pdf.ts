import PDFDocument from 'pdfkit'
import SVGtoPDF from 'svg-to-pdfkit'

import type { Diagram } from '@education-ai/diagram-generation'

import type {
  GeneratedPaper,
  GeneratedQuestion,
  GeneratedSubPart,
} from '@education-ai/exam-generation'

import type { PaperRenderOptions } from '../types/render-options'
import {
  CONTENT_WIDTH,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MARKS_COLUMN_WIDTH,
  MIN_SPACE_FOR_QUESTION,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  mm,
} from '../layout/page-metrics'

const DEFAULT_INSTRUCTIONS = [
  'Answer all questions.',
  'Use a black or dark blue pen.',
  'Write your name, centre number and candidate number in the boxes above.',
  'You may use a calculator.',
  'Take the weight of 1 kg to be 9.8 N.',
  'The number of marks is given in brackets [ ] at the end of each question or part question.',
]

const DEFAULT_ANSWER_SPACE_PER_MARK_MM = 8

// Renders a generated paper as a print-ready PDF.
//
// Returns bytes rather than writing a file: a paper is as likely to be
// streamed to an HTTP response or stored in object storage as it is to
// land on a disk, and a function that insists on a path forces every
// caller that does not want one to invent a temporary file.
export async function renderPaperPdf(
  paper: GeneratedPaper,
  options: PaperRenderOptions = {}
): Promise<Uint8Array> {
  const document = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margins: {
      top: MARGIN_TOP,
      bottom: MARGIN_BOTTOM,
      left: MARGIN_LEFT,
      right: MARGIN_RIGHT,
    },
    // Page numbers are drawn per page as it is finished, so buffering
    // is not needed — but autoFirstPage off keeps the cover explicit
    // rather than implied by construction order.
    autoFirstPage: false,
    info: {
      Title: paper.title,
      Subject: `Syllabus ${paper.syllabusCode}`,
      Creator: paper.generatorModel,
      CreationDate: paper.generatedAt,
    },
  })

  const bytes = collect(document)

  drawCover(document, paper, options)
  paper.questions.forEach((question) =>
    drawQuestion(document, question, options)
  )

  document.end()

  return bytes
}

// pdfkit streams; this gathers the stream into the bytes the caller
// wanted, and rejects rather than hanging if the stream errors.
function collect(document: PDFKit.PDFDocument): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
  })
}

function drawCover(
  document: PDFKit.PDFDocument,
  paper: GeneratedPaper,
  options: PaperRenderOptions
): void {
  document.addPage()

  document
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(paper.title, { align: 'center' })
    .moveDown(0.4)

  document
    .font('Helvetica')
    .fontSize(11)
    .text(`Syllabus ${paper.syllabusCode}`, { align: 'center' })

  if (options.duration) {
    document.text(options.duration, { align: 'center' })
  }

  document.moveDown(1.5)
  drawCandidateBoxes(document)

  document
    .moveDown(1.5)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('INSTRUCTIONS')
  document.moveDown(0.3).font('Helvetica').fontSize(10)

  const instructions = options.instructions ?? DEFAULT_INSTRUCTIONS
  instructions.forEach((line) => {
    document.text(`•  ${line}`, { indent: 6 })
  })

  document.moveDown(1).font('Helvetica-Bold').fontSize(11).text('INFORMATION')
  document
    .moveDown(0.3)
    .font('Helvetica')
    .fontSize(10)
    .text(`•  The total mark for this paper is ${paper.totalMarks}.`, {
      indent: 6,
    })
    .text(`•  There are ${paper.questions.length} questions.`, {
      indent: 6,
    })

  drawFooter(document, paper)
}

function drawCandidateBoxes(document: PDFKit.PDFDocument): void {
  const labels = ['Candidate name', 'Centre number', 'Candidate number']
  const boxHeight = 24

  labels.forEach((label) => {
    const top = document.y

    document
      .rect(
        MARGIN_LEFT,
        top,
        PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
        boxHeight
      )
      .strokeColor('#555555')
      .lineWidth(0.5)
      .stroke()

    document
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(label, MARGIN_LEFT + 4, top + 4)
      .fillColor('black')

    document.y = top + boxHeight + 6
  })
}

function drawQuestion(
  document: PDFKit.PDFDocument,
  question: GeneratedQuestion,
  options: PaperRenderOptions
): void {
  ensureSpace(document, MIN_SPACE_FOR_QUESTION)

  const top = document.y

  document
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(`${question.questionNumber}`, MARGIN_LEFT, top, { width: 20 })

  document
    .font('Helvetica')
    .fontSize(11)
    .text(question.text, MARGIN_LEFT + 24, top, { width: CONTENT_WIDTH })

  const diagram = options.diagrams?.get(question.questionNumber)

  if (diagram) {
    drawDiagram(document, diagram)
  } else if (question.requiresDiagram && question.diagramBrief) {
    drawDiagramPlaceholder(document, question.diagramBrief)
  }

  question.options.forEach((option) => {
    document
      .font('Helvetica')
      .fontSize(11)
      .text(`${option.label}   ${option.text}`, MARGIN_LEFT + 44, document.y, {
        width: CONTENT_WIDTH - 20,
      })
  })

  if (question.parts.length === 0) {
    if (question.options.length === 0) {
      drawAnswerSpace(document, question.marks, options)
    }
    drawMarks(document, question.marks)
  }

  question.parts.forEach((part) => drawPart(document, part, options, 0))

  document.moveDown(1)
}

function drawPart(
  document: PDFKit.PDFDocument,
  part: GeneratedSubPart,
  options: PaperRenderOptions,
  depth: number
): void {
  ensureSpace(document, 60)

  const indent = MARGIN_LEFT + 24 + depth * 22

  document.moveDown(0.4)
  document
    .font('Helvetica')
    .fontSize(11)
    .text(`(${part.label})`, indent, document.y, {
      width: 22,
      continued: false,
    })

  const afterLabel = document.y - document.currentLineHeight()

  document.text(part.text, indent + 24, afterLabel, {
    width: CONTENT_WIDTH - depth * 22 - 24,
  })

  const nested = part.subParts ?? []

  if (nested.length === 0) {
    drawAnswerSpace(document, part.marks, options)
    drawMarks(document, part.marks)
    return
  }

  nested.forEach((child) => drawPart(document, child, options, depth + 1))
}

// Ruled space is what makes a paper answerable on paper. Roughly a line
// per mark, which is what Cambridge allows.
function drawAnswerSpace(
  document: PDFKit.PDFDocument,
  marks: number,
  options: PaperRenderOptions
): void {
  if (options.includeAnswerSpace === false || marks <= 0) {
    return
  }

  const perMark = mm(
    options.answerSpacePerMark ?? DEFAULT_ANSWER_SPACE_PER_MARK_MM
  )
  const lineGap = mm(8)
  const lines = Math.max(1, Math.round((marks * perMark) / lineGap))

  document.moveDown(0.5)

  Array.from({ length: lines }).forEach(() => {
    ensureSpace(document, lineGap + 12)

    const y = document.y + lineGap

    document
      .moveTo(MARGIN_LEFT + 24, y)
      .lineTo(PAGE_WIDTH - MARGIN_RIGHT - MARKS_COLUMN_WIDTH, y)
      .strokeColor('#bbbbbb')
      .lineWidth(0.4)
      .stroke()

    document.y = y
  })

  document.strokeColor('black')
}

// The [n] box in the right margin. Drawn at the current line rather
// than flowed, so it stays beside the answer space it belongs to.
function drawMarks(document: PDFKit.PDFDocument, marks: number): void {
  const y = document.y

  document
    .font('Helvetica')
    .fontSize(10)
    .text(
      `[${marks}]`,
      PAGE_WIDTH - MARGIN_RIGHT - MARKS_COLUMN_WIDTH,
      y - 10,
      { width: MARKS_COLUMN_WIDTH, align: 'right' }
    )

  document.y = y
}

// Drawn as vectors, not rasterised. The figure was generated as SVG
// precisely so it prints at whatever resolution the printer has and
// keeps its labels as real text.
function drawDiagram(document: PDFKit.PDFDocument, diagram: Diagram): void {
  // Scaled to fit the text column, never enlarged past it, keeping
  // aspect ratio from the viewBox.
  const width = Math.min(CONTENT_WIDTH, diagram.width)
  const height = (diagram.height / diagram.width) * width

  ensureSpace(document, height + 28)
  document.moveDown(0.5)

  const top = document.y

  SVGtoPDF(document, diagram.svg, MARGIN_LEFT + 24, top, { width, height })

  document.y = top + height + 4
  document
    .font('Helvetica')
    .fontSize(9)
    .text(diagram.label, MARGIN_LEFT + 24, document.y, {
      width,
      align: 'center',
    })

  document.moveDown(0.5)
}

// When no figure was drawn, the space is reserved and the brief
// printed, so the paper is honest about what is missing rather than
// silently referring to a figure that is not there.
function drawDiagramPlaceholder(
  document: PDFKit.PDFDocument,
  brief: string
): void {
  const height = mm(45)

  ensureSpace(document, height + 20)
  document.moveDown(0.5)

  const top = document.y

  document
    .rect(MARGIN_LEFT + 24, top, CONTENT_WIDTH, height)
    .dash(3, { space: 3 })
    .strokeColor('#999999')
    .lineWidth(0.6)
    .stroke()
    .undash()

  document
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor('#666666')
    .text(`Figure: ${brief}`, MARGIN_LEFT + 30, top + 8, {
      width: CONTENT_WIDTH - 12,
    })
    .fillColor('black')
    .strokeColor('black')

  document.y = top + height + 6
}

function ensureSpace(document: PDFKit.PDFDocument, needed: number): void {
  if (document.y + needed < PAGE_HEIGHT - MARGIN_BOTTOM) {
    return
  }

  document.addPage()
}

function drawFooter(document: PDFKit.PDFDocument, paper: GeneratedPaper): void {
  const y = PAGE_HEIGHT - MARGIN_BOTTOM + 18

  document
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#666666')
    .text(
      `${paper.syllabusCode}  •  generated by ${paper.generatorModel}`,
      MARGIN_LEFT,
      y,
      { width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, align: 'center' }
    )
    .fillColor('black')
}
