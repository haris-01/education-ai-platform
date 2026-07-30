import path from 'node:path'

import { resolveWorkspaceRoot } from '../packages/shared/src/index.js'
import { parseNativePdf } from '../packages/document-ai/src/index.js'
import { buildQuestionDocument } from '../packages/question-extraction/src/index.js'

// Every real Cambridge 0625 *question paper* on disk (mark schemes,
// examiner reports, syllabus, and confidential instructions are a
// different extraction target, not covered by this phase).
const QUESTION_PAPERS = [
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/1/595783-2023-specimen-paper-1.pdf',
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/2/595784-2023-specimen-paper-2.pdf',
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/3/595785-2023-specimen-paper-3.pdf',
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/4/595786-2023-specimen-paper-4.pdf',
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/5/595788-2023-specimen-paper-5.pdf',
  'datasets/cambridge/igcse/physics/0625/specimen-papers/2023/6/595789-2023-specimen-paper-6.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/11/570010-june-2024-question-paper-11.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/21/570011-june-2024-question-paper-21.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/31/570012-june-2024-question-paper-31.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/41/671385-june-2024-question-paper-41.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/51/671386-june-2024-question-paper-51.pdf',
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj/61/671387-june-2024-question-paper-61.pdf',
]

interface Report {
  file: string
  pages: number
  questions: number
  questionNumbers: number[]
  hasGapsOrDupes: boolean
  questionsWithNoContent: number
  marksMismatches: string[]
  optionsSummary: string
  error?: string
}

async function inspect(relativePath: string): Promise<Report> {
  const filePath = path.join(resolveWorkspaceRoot(process.cwd()), relativePath)
  const file = path.basename(relativePath)

  try {
    const parsed = await parseNativePdf(filePath)
    const questionDocument = buildQuestionDocument(parsed)
    const numbers = questionDocument.questions.map((q) => q.number)
    const expected = numbers.map((_, i) => numbers[0] + i)
    const hasGapsOrDupes = JSON.stringify(numbers) !== JSON.stringify(expected)

    const questionsWithNoContent = questionDocument.questions.filter(
      (q) => q.text.trim() === '' && q.parts.length === 0 && q.options.length === 0
    ).length

    const marksMismatches = questionDocument.questions.flatMap((q) => {
      if (q.marks === undefined || q.parts.length === 0) {
        return []
      }
      const sum = q.parts.reduce((s, p) => {
        if (p.marks !== undefined) {
          return s + p.marks
        }
        return s + p.subParts.reduce((s2, sp) => s2 + (sp.marks ?? 0), 0)
      }, 0)
      return sum !== q.marks ? [`Q${q.number}: total=${q.marks} sum=${sum}`] : []
    })

    const withOptions = questionDocument.questions.filter((q) => q.options.length > 0)
    const with4Options = withOptions.filter((q) => q.options.length === 4)
    const optionsSummary =
      withOptions.length === 0
        ? 'none'
        : `${withOptions.length} questions have options, ${with4Options.length} have exactly 4`

    return {
      file,
      pages: parsed.metadata.pageCount,
      questions: questionDocument.questions.length,
      questionNumbers: numbers,
      hasGapsOrDupes,
      questionsWithNoContent,
      marksMismatches,
      optionsSummary,
    }
  } catch (error) {
    return {
      file,
      pages: 0,
      questions: 0,
      questionNumbers: [],
      hasGapsOrDupes: false,
      questionsWithNoContent: 0,
      marksMismatches: [],
      optionsSummary: 'n/a',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main(): Promise<void> {
  const reports = await Promise.all(QUESTION_PAPERS.map(inspect))
  reports.forEach((r) => {
    console.info(`\n=== ${r.file} ===`)
    if (r.error) {
      console.info(`  ERROR: ${r.error}`)
      return
    }
    console.info(`  pages: ${r.pages}, questions: ${r.questions}`)
    console.info(`  numbers: ${r.questionNumbers.join(',')}`)
    console.info(`  sequential (no gaps/dupes): ${!r.hasGapsOrDupes}`)
    console.info(`  questions with zero content: ${r.questionsWithNoContent}`)
    console.info(
      `  marks mismatches: ${r.marksMismatches.length === 0 ? 'none' : r.marksMismatches.join('; ')}`
    )
    console.info(`  options: ${r.optionsSummary}`)
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
