import type { DifficultyBand } from '@education-ai/difficulty-estimation'
import type { SearchHit } from '@education-ai/vector-store'

import type {
  GeneratedOption,
  GeneratedPaper,
  GeneratedQuestion,
  GeneratedSubPart,
} from './types/generated-paper'
import type { PaperSpec } from './types/paper-spec'

export function markPoint(text: string, marks = 1) {
  return { text, marks }
}

export function option(
  label: string,
  text: string,
  correct = false
): GeneratedOption {
  return { label, text, correct }
}

export function subPart(
  label: string,
  text: string,
  marks: number,
  overrides: { subParts?: GeneratedSubPart[] } = {}
): GeneratedSubPart {
  return {
    label,
    text,
    marks,
    markScheme: [markPoint(`answer to ${label}`, marks)],
    subParts: overrides.subParts,
  }
}

export function question(
  questionNumber: number,
  overrides: Partial<GeneratedQuestion> = {}
): GeneratedQuestion {
  return {
    questionNumber,
    topicNumber: 1,
    text: `Question ${questionNumber} stem.`,
    parts: [],
    options: [],
    marks: 4,
    assessmentObjective: 'AO1',
    difficulty: 'moderate' as DifficultyBand,
    markScheme: [markPoint('the expected answer', 4)],
    requiresDiagram: false,
    sourceChunkIds: ['chunk-1'],
    ...overrides,
  }
}

export function paper(
  questions: GeneratedQuestion[],
  overrides: Partial<GeneratedPaper> = {}
): GeneratedPaper {
  return {
    syllabusCode: '0625',
    title: 'Generated Paper',
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    questions,
    generatorModel: 'fake-generator',
    generatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

export function spec(overrides: Partial<PaperSpec> = {}): PaperSpec {
  return {
    syllabusCode: '0625',
    title: 'Generated Paper',
    totalMarks: 8,
    topics: [{ topicNumber: 1, questionCount: 2 }],
    ...overrides,
  }
}

export function sourceHit(id: string, content: string): SearchHit {
  return {
    id,
    chunkType: 'question',
    sourceDocumentId: 'PAPER-41',
    content,
    metadata: { assessmentObjectives: [], hasDiagram: false, isExemplar: true },
    payload: {},
  }
}
