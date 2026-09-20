import type { ParsedDocument, TableElement } from '@education-ai/document-ai'

import type {
  MarkPoint,
  QuestionMarkScheme,
  TheoryMarkScheme,
} from '../types/theory-mark-scheme'

const EXTRACTOR_VERSION = '0.1.0'

const HEADER_ROW = ['question', 'answer', 'marks']

/**
 * Extracts marking points from a Cambridge theory mark scheme: a
 * "Question | Answer | Marks" table repeated across pages, one row per
 * marking point, with the Question cell left blank on a row that
 * continues the question above it (a second acceptable method, a
 * supporting mark, etc.). Confirmed against real 0625 June 2024 theory
 * mark schemes (papers 3 and 4).
 *
 * Table layout is not universal across document generations: the 2023
 * specimen-paper mark schemes in this dataset use an older Cambridge PDF
 * template whose table lacks full column gridlines, so the lattice
 * detector in `document-ai` reads it as a differently-shaped (and here,
 * useless) table. `isMarkSchemeTable` filters those out by requiring an
 * exact "Question, Answer, Marks" header row — a paper in that older
 * template returns zero questions rather than wrong ones, an honest gap
 * rather than a silent misread.
 *
 * Deliberately shallow, same reasoning as `ExaminerReport`'s per-question
 * commentary: each row's Answer-column text is kept verbatim rather than
 * parsed into a single "correct answer" the way MCQ mark schemes are.
 * Whether several mark points under one question are additive marks or
 * alternative ("OR") routes to the same marks isn't decidable from the
 * table alone, so no total-marks figure is computed here — a wrong sum
 * would be worse than no sum.
 */
export function buildTheoryMarkScheme(
  parsed: ParsedDocument
): TheoryMarkScheme {
  const rows = parsed.pages.flatMap((page) =>
    [...page.tableElements]
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y)
      .filter(isMarkSchemeTable)
      .flatMap((table) => table.cells.slice(1))
  )

  const { order, byQuestion } = rows.reduce(groupRowIntoQuestion, {
    order: [] as string[],
    byQuestion: new Map<string, MarkPoint[]>(),
    currentQuestion: undefined as string | undefined,
  })

  const questions: QuestionMarkScheme[] = order.map((questionNumber) => ({
    questionNumber,
    markPoints: byQuestion.get(questionNumber) ?? [],
  }))

  return {
    metadata: {
      resourceId: parsed.metadata.resourceId,
      title: parsed.metadata.title,
      pageCount: parsed.metadata.pageCount,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    questions,
  }
}

function isMarkSchemeTable(table: TableElement): boolean {
  const header = table.cells[0]
  if (!header || header.length !== 3) {
    return false
  }
  return (
    header.map((cell) => cell.trim().toLowerCase()).join(',') ===
    HEADER_ROW.join(',')
  )
}

interface GroupingState {
  order: string[]
  byQuestion: Map<string, MarkPoint[]>
  currentQuestion: string | undefined
}

function groupRowIntoQuestion(
  state: GroupingState,
  row: string[]
): GroupingState {
  const [questionCell = '', answerCell = '', marksCell = ''] = row
  const questionNumber = questionCell.trim() || state.currentQuestion
  const text = answerCell.trim()
  const markCode = marksCell.trim() || undefined

  if (questionNumber === undefined || (text === '' && markCode === undefined)) {
    return state
  }

  const markPoint: MarkPoint = { text, markCode }
  const isNewQuestion = !state.byQuestion.has(questionNumber)
  const existingPoints = state.byQuestion.get(questionNumber) ?? []

  return {
    order: isNewQuestion ? [...state.order, questionNumber] : state.order,
    byQuestion: new Map(state.byQuestion).set(questionNumber, [
      ...existingPoints,
      markPoint,
    ]),
    currentQuestion: questionNumber,
  }
}
