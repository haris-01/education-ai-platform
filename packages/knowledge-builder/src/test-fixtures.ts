import type { PaperExaminerReport } from '@education-ai/examiner-report-extraction'
import type {
  McqAnswer,
  McqMarkScheme,
  QuestionMarkScheme,
  TheoryMarkScheme,
} from '@education-ai/mark-scheme-extraction'
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
  SyllabusOverview,
  SyllabusTopic,
} from '@education-ai/syllabus-extraction'

const NO_REFS: ElementRefs = { imageRefs: [], drawingRefs: [], tableRefs: [] }

export function subPart(label: string, text: string): QuestionSubPart {
  return { label, text, pageNumbers: [1], ...NO_REFS }
}

export function part(
  label: string,
  text: string,
  subParts: QuestionSubPart[] = []
): QuestionPart {
  return { label, text, pageNumbers: [1], subParts, ...NO_REFS }
}

export function option(label: string, text: string): QuestionOption {
  return { label, text }
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

export function questionDocument(
  questions: Question[],
  overrides: { paper?: PaperIdentity } = {}
): QuestionDocument {
  return {
    metadata: {
      resourceId: 'test-question-doc',
      title: 'test-question-doc',
      pageCount: 1,
      paper: overrides.paper,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    questions,
  }
}

export function topic(number: number, name: string): SyllabusTopic {
  return { number, name }
}

export function syllabusOverview(topics: SyllabusTopic[]): SyllabusOverview {
  return {
    metadata: {
      resourceId: 'test-syllabus',
      title: 'test-syllabus',
      pageCount: 1,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    topics,
    assessmentObjectives: [],
    commandWords: [],
    subTopics: [],
  }
}

export function mcqAnswer(
  questionNumber: number,
  answer: string,
  marks = 1
): McqAnswer {
  return { questionNumber, answer, marks }
}

export function mcqMarkScheme(answers: McqAnswer[]): McqMarkScheme {
  return {
    metadata: {
      resourceId: 'test-mark-scheme',
      title: 'test-mark-scheme',
      pageCount: 1,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    answers,
  }
}

export function theoryMarkScheme(
  questions: QuestionMarkScheme[]
): TheoryMarkScheme {
  return {
    metadata: {
      resourceId: 'test-theory-mark-scheme',
      title: 'test-theory-mark-scheme',
      pageCount: 1,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    questions,
  }
}

export function paperExaminerReport(
  paperCode: string,
  questionComments: PaperExaminerReport['questionComments']
): PaperExaminerReport {
  return { paperCode, generalComments: '', questionComments }
}
