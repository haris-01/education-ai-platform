import type { AssemblyEvent } from './build-assembly-events'
import type { ClassifiedLine } from '../types/classified-line'
import type {
  ElementRefs,
  Question,
  QuestionOption,
  QuestionPart,
  QuestionSubPart,
} from '../types/question'

interface SubPartBuilder extends ElementRefs {
  label: string
  textParts: string[]
  marks?: number
  pageNumbers: number[]
}

interface PartBuilder extends ElementRefs {
  label: string
  textParts: string[]
  marks?: number
  pageNumbers: number[]
  subParts: QuestionSubPart[]
  currentSubPart: SubPartBuilder | null
}

interface QuestionBuilder extends ElementRefs {
  number: number
  textParts: string[]
  marks?: number
  pageNumbers: number[]
  parts: QuestionPart[]
  currentPart: PartBuilder | null
  options: QuestionOption[]
  // The option label this question will accept next, or null once D has
  // been consumed. Starts at "A" — a line only ever confirms as an option
  // if it matches this exactly, which is what stops an ordinary sentence
  // like "A uniform rod..." from being mistaken for option A.
  nextOptionLabel: string | null
}

const OPTION_SEQUENCE = ['A', 'B', 'C', 'D']

function nextOptionLabel(label: string): string | null {
  const index = OPTION_SEQUENCE.indexOf(label)
  return index === -1 || index === OPTION_SEQUENCE.length - 1
    ? null
    : OPTION_SEQUENCE[index + 1]
}

interface AssemblyState {
  questions: Question[]
  current: QuestionBuilder | null
}

const EMPTY_REFS: ElementRefs = {
  imageRefs: [],
  drawingRefs: [],
  tableRefs: [],
}

/**
 * Walks the merged line/diagram event stream (already flattened across
 * every page, in reading order) and assembles it into a `Question[]`
 * tree: question -> parts ("a", "b") -> sub-parts ("i", "ii"), with
 * diagram/table refs attached to whichever entity was open when that
 * element's position came up. A question stays open across page
 * boundaries until the next question-number line starts, which is what
 * makes multi-page questions (and diagrams placed on the following page)
 * work — nothing here is page-scoped.
 */
export function assembleQuestions(events: AssemblyEvent[]): Question[] {
  const finalState = events.reduce<AssemblyState>(applyEvent, {
    questions: [],
    current: null,
  })

  return finalState.current
    ? [...finalState.questions, finalizeQuestion(finalState.current)]
    : finalState.questions
}

function applyEvent(state: AssemblyState, event: AssemblyEvent): AssemblyState {
  if (event.kind === 'line') {
    return applyLine(state, event.classified)
  }
  return applyElement(state, event)
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
        ...EMPTY_REFS,
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
        ...EMPTY_REFS,
      }
    : null

  const current: QuestionBuilder = {
    number: classified.questionNumber,
    textParts: currentPart ? [] : [classified.content],
    marks: classified.totalMarks ?? (currentPart ? undefined : classified.marks),
    pageNumbers: [pageNumber],
    parts: [],
    currentPart,
    options: [],
    nextOptionLabel: 'A',
    ...EMPTY_REFS,
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
        ...EMPTY_REFS,
      }
    : null

  const currentPart: PartBuilder = {
    label: classified.partLabel,
    textParts: currentSubPart ? [] : [classified.content],
    marks: currentSubPart ? undefined : classified.marks,
    pageNumbers: [pageNumber],
    subParts: [],
    currentSubPart,
    ...EMPTY_REFS,
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
    ...EMPTY_REFS,
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

  if (
    !part &&
    classified.optionLabel !== undefined &&
    classified.optionLabel === question.nextOptionLabel
  ) {
    const current: QuestionBuilder = {
      ...question,
      options: [
        ...question.options,
        { label: classified.optionLabel, text: classified.content },
      ],
      nextOptionLabel: nextOptionLabel(classified.optionLabel),
      pageNumbers: appendPageNumber(question.pageNumbers, pageNumber),
    }
    return { questions: state.questions, current }
  }

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

function applyElement(
  state: AssemblyState,
  event: Extract<AssemblyEvent, { kind: 'image' | 'drawing' | 'table' }>
): AssemblyState {
  const question = state.current
  if (!question) {
    return state
  }
  const part = question.currentPart

  if (part?.currentSubPart) {
    const currentSubPart = appendElementRef(
      part.currentSubPart,
      event.kind,
      event.element.id
    )
    const currentPart: PartBuilder = { ...part, currentSubPart }
    const current: QuestionBuilder = { ...question, currentPart }
    return { questions: state.questions, current }
  }

  if (part) {
    const currentPart = appendElementRef(part, event.kind, event.element.id)
    const current: QuestionBuilder = { ...question, currentPart }
    return { questions: state.questions, current }
  }

  const current = appendElementRef(question, event.kind, event.element.id)
  return { questions: state.questions, current }
}

function appendElementRef<T extends ElementRefs>(
  entity: T,
  kind: 'image' | 'drawing' | 'table',
  id: string
): T {
  if (kind === 'image') {
    return { ...entity, imageRefs: [...entity.imageRefs, id] }
  }
  if (kind === 'drawing') {
    return { ...entity, drawingRefs: [...entity.drawingRefs, id] }
  }
  return { ...entity, tableRefs: [...entity.tableRefs, id] }
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
    imageRefs: subPart.imageRefs,
    drawingRefs: subPart.drawingRefs,
    tableRefs: subPart.tableRefs,
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
    imageRefs: part.imageRefs,
    drawingRefs: part.drawingRefs,
    tableRefs: part.tableRefs,
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
    options: question.options,
    imageRefs: question.imageRefs,
    drawingRefs: question.drawingRefs,
    tableRefs: question.tableRefs,
  }
}
