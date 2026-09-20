import type {
  KnowledgeDocument,
  KnowledgeQuestion,
} from '@education-ai/knowledge-builder'
import type {
  ElementRefs,
  QuestionOption,
  QuestionPart,
  QuestionSubPart,
} from '@education-ai/question-extraction'
import type { PaperIdentity } from '@education-ai/shared'
import type {
  SyllabusSection,
  SyllabusSubTopic,
  SyllabusTopic,
} from '@education-ai/syllabus-extraction'

const NO_REFS: ElementRefs = { imageRefs: [], drawingRefs: [], tableRefs: [] }

export const PAPER_41: PaperIdentity = {
  syllabusCode: '0625',
  code: '41',
  number: 4,
  variant: 1,
}

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

export function knowledgeQuestion(
  questionNumber: number,
  text: string,
  overrides: Partial<KnowledgeQuestion> = {}
): KnowledgeQuestion {
  return {
    questionNumber,
    text,
    parts: [],
    options: [],
    assessmentObjectives: [],
    marksByAssessmentObjective: {},
    commonMistakes: [],
    ...NO_REFS,
    ...overrides,
    withdrawn: overrides.withdrawn ?? false,
  }
}

export function knowledgeDocument(
  questions: KnowledgeQuestion[],
  overrides: {
    paper?: PaperIdentity
    topics?: SyllabusTopic[]
    subTopics?: SyllabusSubTopic[]
    resourceId?: string
  } = {}
): KnowledgeDocument {
  return {
    metadata: {
      resourceId: overrides.resourceId ?? 'CAM-0625-MJ-2024-41-QP',
      title: 'June 2024 Question Paper 41',
      paper: overrides.paper,
      extractedAt: new Date('2024-01-01T00:00:00Z'),
      extractorVersion: 'test',
    },
    questions,
    topics: overrides.topics ?? [],
    subTopics: overrides.subTopics ?? [],
    assessmentObjectives: [],
  }
}

export function topic(number: number, name: string): SyllabusTopic {
  return { number, name }
}

export function section(
  number: string,
  name: string,
  core: string[],
  supplement: string[] = []
): SyllabusSection {
  return {
    number,
    name,
    core: core.map((text, index) => ({ number: index + 1, text })),
    supplement: supplement.map((text, index) => ({
      number: core.length + index + 1,
      text,
    })),
  }
}

export function subTopic(
  number: string,
  topicNumber: number,
  name: string,
  sections: SyllabusSection[]
): SyllabusSubTopic {
  return { number, topicNumber, name, sections }
}
