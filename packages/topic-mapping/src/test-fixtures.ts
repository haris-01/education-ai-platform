import type {
  ElementRefs,
  Question,
  QuestionDocument,
  QuestionOption,
  QuestionPart,
  QuestionSubPart,
} from '@education-ai/question-extraction'
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
  overrides: { parts?: QuestionPart[]; options?: QuestionOption[] } = {}
): Question {
  return {
    number,
    text,
    pageNumbers: [1],
    parts: overrides.parts ?? [],
    options: overrides.options ?? [],
    ...NO_REFS,
  }
}

export function questionDocument(questions: Question[]): QuestionDocument {
  return {
    metadata: {
      resourceId: 'test-question-doc',
      title: 'test-question-doc',
      pageCount: 1,
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
  }
}
