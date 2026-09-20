import type {
  PaperExaminerReport,
  QuestionComment,
} from '@education-ai/examiner-report-extraction'
import type {
  ElementRefs,
  Question,
  QuestionDocument,
} from '@education-ai/question-extraction'

const NO_REFS: ElementRefs = { imageRefs: [], drawingRefs: [], tableRefs: [] }

export function question(
  number: number,
  text = 'A question.',
  overrides: { withdrawn?: boolean } = {}
): Question {
  return {
    number,
    text,
    pageNumbers: [1],
    parts: [],
    options: [],
    withdrawn: overrides.withdrawn ?? false,
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

export function questionComment(
  questionNumber: number,
  comment: string
): QuestionComment {
  return { questionNumber, comment, commonMistakes: [] }
}

export function examinerReport(
  questionComments: QuestionComment[]
): PaperExaminerReport {
  return {
    paperCode: '0625/41',
    generalComments: '',
    questionComments,
  }
}
