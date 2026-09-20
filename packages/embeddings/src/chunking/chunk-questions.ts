import type {
  KnowledgeDocument,
  KnowledgeQuestion,
} from '@education-ai/knowledge-builder'
import type {
  QuestionOption,
  QuestionPart,
} from '@education-ai/question-extraction'

import type { Chunk } from '../types/chunk'
import { createChunkId, hashContent } from './chunk-identity'
import {
  composeChunkText,
  marksLabel,
  paperLabel,
  topicLabel,
} from './compose-chunk-text'

// One chunk per question, holding the whole question: stem, every
// sub-part, and every multiple-choice option.
//
// A question is the natural retrieval unit for this project — Phase 7
// retrieves exemplar questions to imitate, not paragraphs — and Phase 3
// already segmented the corpus this way, so fixed-size token windows
// would only discard that work and cut questions in half.
export function chunkQuestions(document: KnowledgeDocument): Chunk[] {
  const paper = paperLabel(
    document.metadata.paper?.syllabusCode,
    document.metadata.paper?.code
  )
  const expectsOptions = isMultipleChoicePaper(document)

  // A withdrawal notice is not a question and is not chunked at all.
  // Embedding it would spend money to put "the question has been removed
  // from the question paper" into a store whose purpose is to answer
  // questions about physics.
  return document.questions
    .filter((question) => !question.withdrawn)
    .map((question) =>
      buildQuestionChunk(question, document, paper, expectsOptions)
    )
}

// Read off the document rather than from the paper number: "papers 1 and
// 2 are multiple choice" is a Cambridge convention, and the same rule
// has to hold when this meets Edexcel. If most questions on a paper
// carry options, it is a multiple-choice paper, and one without them has
// been extracted incompletely.
function isMultipleChoicePaper(document: KnowledgeDocument): boolean {
  const questions = document.questions.filter((question) => !question.withdrawn)

  if (questions.length === 0) {
    return false
  }

  const withOptions = questions.filter(
    (question) => question.options.length > 0
  )

  return withOptions.length / questions.length > 0.5
}

function buildQuestionChunk(
  question: KnowledgeQuestion,
  document: KnowledgeDocument,
  paper: string | undefined,
  expectsOptions: boolean
): Chunk {
  const content = composeChunkText(
    [
      paper,
      topicLabel(question.topicNumber, question.topicName),
      `Question ${question.questionNumber}`,
      marksLabel(question.marks),
    ],
    renderQuestionBody(question)
  )

  return {
    id: createChunkId(
      document.metadata.resourceId,
      'question',
      String(question.questionNumber)
    ),
    chunkType: 'question',
    sourceDocumentId: document.metadata.resourceId,
    content,
    contentHash: hashContent(content),
    metadata: {
      syllabusCode: document.metadata.paper?.syllabusCode,
      paperCode: document.metadata.paper?.code,
      questionNumber: question.questionNumber,
      topicNumber: question.topicNumber,
      topicName: question.topicName,
      assessmentObjectives: question.assessmentObjectives,
      primaryAssessmentObjective: question.primaryAssessmentObjective,
      difficulty: question.difficulty,
      marks: question.marks,
      hasDiagram:
        question.imageRefs.length > 0 ||
        question.drawingRefs.length > 0 ||
        question.tableRefs.length > 0,
      isExemplar: !(expectsOptions && question.options.length === 0),
    },
    payload: {
      correctAnswer: question.correctAnswer,
      markingPoints: question.markingPoints,
      options: question.options.length > 0 ? question.options : undefined,
      imageRefs: question.imageRefs,
      drawingRefs: question.drawingRefs,
      tableRefs: question.tableRefs,
    },
  }
}

// The question as a candidate reads it: stem, then parts in their printed
// labels, then options. Labels are kept because they carry meaning a bare
// concatenation loses — "(b)(ii)" tells a generator this is a third-level
// follow-up, which is exactly the structure Phase 7 has to reproduce.
function renderQuestionBody(question: KnowledgeQuestion): string {
  const sections = [
    question.text.trim(),
    renderParts(question.parts),
    renderOptions(question.options),
  ]

  return sections.filter((section) => section.length > 0).join('\n\n')
}

function renderParts(parts: QuestionPart[]): string {
  return parts
    .map((part) => {
      const subParts = part.subParts
        .map((subPart) => `  (${subPart.label}) ${subPart.text.trim()}`)
        .join('\n')

      const head = `(${part.label}) ${part.text.trim()}`

      if (!subParts) {
        return head
      }

      return `${head}\n${subParts}`
    })
    .join('\n')
}

function renderOptions(options: QuestionOption[]): string {
  return options
    .map((option) => `${option.label} ${option.text.trim()}`)
    .join('\n')
}
