import type {
  ElementRefs,
  Question,
  QuestionDocument,
  QuestionOption,
  QuestionPart,
  QuestionSubPart,
} from '@education-ai/question-extraction'
import type { PaperIdentity } from '@education-ai/shared'
import type {
  CommandWord,
  SyllabusOverview,
} from '@education-ai/syllabus-extraction'

const NO_REFS: ElementRefs = { imageRefs: [], drawingRefs: [], tableRefs: [] }

export function subPart(
  label: string,
  text: string,
  marks?: number
): QuestionSubPart {
  return { label, text, marks, pageNumbers: [1], ...NO_REFS }
}

export function part(
  label: string,
  text: string,
  overrides: { marks?: number; subParts?: QuestionSubPart[] } = {}
): QuestionPart {
  return {
    label,
    text,
    marks: overrides.marks,
    pageNumbers: [1],
    subParts: overrides.subParts ?? [],
    ...NO_REFS,
  }
}

export function options(texts: string[]): QuestionOption[] {
  return texts.map((text, index) => ({
    label: String.fromCharCode('A'.charCodeAt(0) + index),
    text,
  }))
}

export function question(
  number: number,
  text: string,
  overrides: {
    marks?: number
    parts?: QuestionPart[]
    options?: QuestionOption[]
    withdrawn?: boolean
  } = {}
): Question {
  return {
    number,
    text,
    marks: overrides.marks,
    pageNumbers: [1],
    parts: overrides.parts ?? [],
    options: overrides.options ?? [],
    withdrawn: overrides.withdrawn ?? false,
    ...NO_REFS,
  }
}

export function paper(number: number, variant?: number): PaperIdentity {
  return {
    syllabusCode: '0625',
    code: variant === undefined ? String(number) : `${number}${variant}`,
    number,
    variant,
  }
}

export function questionDocument(
  questions: Question[],
  paperIdentity?: PaperIdentity
): QuestionDocument {
  return {
    metadata: {
      resourceId: 'test-question-doc',
      title: 'test-question-doc',
      pageCount: 1,
      paper: paperIdentity,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    questions,
  }
}

// The real 0625 glossary, so tests exercise the same vocabulary the
// syllabus extractor produces rather than a convenient subset.
export const COMMAND_WORDS_0625: CommandWord[] = [
  { word: 'Calculate', meaning: 'work out from given facts' },
  { word: 'Comment', meaning: 'give an informed opinion' },
  { word: 'Compare', meaning: 'identify similarities and differences' },
  { word: 'Deduce', meaning: 'conclude from available information' },
  { word: 'Define', meaning: 'give precise meaning' },
  { word: 'Describe', meaning: 'state the points of a topic' },
  { word: 'Determine', meaning: 'establish an answer' },
  { word: 'Explain', meaning: 'set out purposes or reasons' },
  { word: 'Give', meaning: 'produce an answer from recall' },
  { word: 'Identify', meaning: 'name/select/recognise' },
  { word: 'Justify', meaning: 'support a case with evidence' },
  { word: 'Predict', meaning: 'suggest what may happen' },
  { word: 'Sketch', meaning: 'make a simple freehand drawing' },
  { word: 'State', meaning: 'express in clear terms' },
  { word: 'Suggest', meaning: 'apply knowledge and understanding' },
]

export function syllabusOverview(
  commandWords: CommandWord[] = COMMAND_WORDS_0625
): SyllabusOverview {
  return {
    metadata: {
      resourceId: 'test-syllabus',
      title: 'test-syllabus',
      pageCount: 1,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    topics: [],
    assessmentObjectives: [],
    commandWords,
    subTopics: [],
  }
}
