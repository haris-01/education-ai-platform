import type { ClassifiedLine } from '../types/classified-line'
import type { Question, QuestionPart, QuestionSubPart } from '../types/question'

interface SubPartBuilder {
  label: string
  textParts: string[]
  marks?: number
  pageNumbers: number[]
}

interface PartBuilder {
  label: string
  textParts: string[]
  marks?: number
  pageNumbers: number[]
  subParts: QuestionSubPart[]
  currentSubPart: SubPartBuilder | null
}

interface QuestionBuilder {
  number: number
  textParts: string[]
  marks?: number
  pageNumbers: number[]
  parts: QuestionPart[]
  currentPart: PartBuilder | null
}

interface AssemblyState {
  questions: Question[]
  current: QuestionBuilder | null
}

/**
 * Walks classified lines (already flattened across every page, in reading
 * order) and assembles them into a `Question[]` tree: question -> parts
 * ("a", "b") -> sub-parts ("i", "ii"). A question stays open across page
 * boundaries until the next question-number line starts, which is what
 * makes multi-page questions work — nothing here is page-scoped.
 */
export function assembleQuestions(lines: ClassifiedLine[]): Question[] {
  const finalState = lines.reduce<AssemblyState>(applyLine, {
    questions: [],
    current: null,
  })

  return finalState.current
    ? [...finalState.questions, finalizeQuestion(finalState.current)]
    : finalState.questions
}

function applyLine(state: AssemblyState, classified: ClassifiedLine): AssemblyState {
  if (classified.role === 'questionNumber') {
    return applyQuestionNumber(state, classified)
  }
  if (classified.role === 'subpart') {
    return applySubpart(state, classified)
  }
  if (classified.role === 'subSubpart') {
    return applySubSubpart(state, classified)
  }
  if (classified.role === 'boilerplate') {
    return state
  }
  return applyBody(state, classified)
}

function applyQuestionNumber(
  state: AssemblyState,
  classified: ClassifiedLine
): AssemblyState {
  if (classified.questionNumber === undefined) {
    return state
  }
  const pageNumber = classified.line.pageNumber
  const questions = state.current
    ? [...state.questions, finalizeQuestion(state.current)]
    : state.questions

  const currentSubPart: SubPartBuilder | null = classified.nestedPartLabel
    ? {
        label: classified.nestedPartLabel,
        textParts: [classified.content],
        marks: classified.marks,
        pageNumbers: [pageNumber],
      }
    : null

  const currentPart: PartBuilder | null = classified.partLabel
    ? {
        label: classified.partLabel,
        textParts: currentSubPart ? [] : [classified.content],
        marks: currentSubPart ? undefined : classified.marks,
        pageNumbers: [pageNumber],
        subParts: [],
        currentSubPart,
      }
    : null

  const current: QuestionBuilder = {
    number: classified.questionNumber,
    textParts: currentPart ? [] : [classified.content],
    marks: classified.totalMarks ?? (currentPart ? undefined : classified.marks),
    pageNumbers: [pageNumber],
    parts: [],
    currentPart,
  }

  return { questions, current }
}

function applySubpart(
  state: AssemblyState,
  classified: ClassifiedLine
): AssemblyState {
  const question = state.current
  if (!question || classified.partLabel === undefined) {
    return state
  }
  const pageNumber = classified.line.pageNumber

  const parts = question.currentPart
    ? [...question.parts, finalizePart(question.currentPart)]
    : question.parts

  const currentSubPart: SubPartBuilder | null = classified.nestedPartLabel
    ? {
        label: classified.nestedPartLabel,
        textParts: [classified.content],
        marks: classified.marks,
        pageNumbers: [pageNumber],
      }
    : null

  const currentPart: PartBuilder = {
    label: classified.partLabel,
    textParts: currentSubPart ? [] : [classified.content],
    marks: currentSubPart ? undefined : classified.marks,
    pageNumbers: [pageNumber],
    subParts: [],
    currentSubPart,
  }

  const current: QuestionBuilder = {
    ...question,
    parts,
    currentPart,
    pageNumbers: appendPageNumber(question.pageNumbers, pageNumber),
    marks: classified.totalMarks ?? question.marks,
  }

  return { questions: state.questions, current }
}

function applySubSubpart(
  state: AssemblyState,
  classified: ClassifiedLine
): AssemblyState {
  const question = state.current
  if (!question || !question.currentPart || classified.partLabel === undefined) {
    return state
  }
  const part = question.currentPart
  const pageNumber = classified.line.pageNumber

  const subParts = part.currentSubPart
    ? [...part.subParts, finalizeSubPart(part.currentSubPart)]
    : part.subParts

  const currentSubPart: SubPartBuilder = {
    label: classified.partLabel,
    textParts: [classified.content],
    marks: classified.marks,
    pageNumbers: [pageNumber],
  }

  const currentPart: PartBuilder = {
    ...part,
    subParts,
    currentSubPart,
    pageNumbers: appendPageNumber(part.pageNumbers, pageNumber),
  }

  const current: QuestionBuilder = {
    ...question,
    currentPart,
    pageNumbers: appendPageNumber(question.pageNumbers, pageNumber),
    marks: classified.totalMarks ?? question.marks,
  }

  return { questions: state.questions, current }
}

function applyBody(
  state: AssemblyState,
  classified: ClassifiedLine
): AssemblyState {
  const question = state.current
  if (!question) {
    return state
  }
  const pageNumber = classified.line.pageNumber
  const part = question.currentPart

  if (part?.currentSubPart) {
    const subPart = part.currentSubPart
    const currentSubPart: SubPartBuilder = {
      ...subPart,
      textParts: [...subPart.textParts, classified.content],
      marks: classified.marks ?? subPart.marks,
      pageNumbers: appendPageNumber(subPart.pageNumbers, pageNumber),
    }
    const currentPart: PartBuilder = {
      ...part,
      currentSubPart,
      pageNumbers: appendPageNumber(part.pageNumbers, pageNumber),
    }
    const current: QuestionBuilder = {
      ...question,
      currentPart,
      pageNumbers: appendPageNumber(question.pageNumbers, pageNumber),
      marks: classified.totalMarks ?? question.marks,
    }
    return { questions: state.questions, current }
  }

  if (part) {
    const currentPart: PartBuilder = {
      ...part,
      textParts: [...part.textParts, classified.content],
      marks: classified.marks ?? part.marks,
      pageNumbers: appendPageNumber(part.pageNumbers, pageNumber),
    }
    const current: QuestionBuilder = {
      ...question,
      currentPart,
      pageNumbers: appendPageNumber(question.pageNumbers, pageNumber),
      marks: classified.totalMarks ?? question.marks,
    }
    return { questions: state.questions, current }
  }

  const current: QuestionBuilder = {
    ...question,
    textParts: [...question.textParts, classified.content],
    marks: classified.marks ?? classified.totalMarks ?? question.marks,
    pageNumbers: appendPageNumber(question.pageNumbers, pageNumber),
  }
  return { questions: state.questions, current }
}

function appendPageNumber(pageNumbers: number[], pageNumber: number): number[] {
  return pageNumbers.includes(pageNumber)
    ? pageNumbers
    : [...pageNumbers, pageNumber]
}

function finalizeSubPart(subPart: SubPartBuilder): QuestionSubPart {
  return {
    label: subPart.label,
    text: subPart.textParts.join(' ').trim(),
    marks: subPart.marks,
    pageNumbers: subPart.pageNumbers,
  }
}

function finalizePart(part: PartBuilder): QuestionPart {
  const subParts = part.currentSubPart
    ? [...part.subParts, finalizeSubPart(part.currentSubPart)]
    : part.subParts

  return {
    label: part.label,
    text: part.textParts.join(' ').trim(),
    marks: part.marks,
    pageNumbers: part.pageNumbers,
    subParts,
  }
}

function finalizeQuestion(question: QuestionBuilder): Question {
  const parts = question.currentPart
    ? [...question.parts, finalizePart(question.currentPart)]
    : question.parts

  return {
    number: question.number,
    text: question.textParts.join(' ').trim(),
    marks: question.marks,
    pageNumbers: question.pageNumbers,
    parts,
  }
}
