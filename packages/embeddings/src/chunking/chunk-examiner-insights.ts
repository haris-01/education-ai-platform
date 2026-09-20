import type {
  KnowledgeDocument,
  KnowledgeQuestion,
} from '@education-ai/knowledge-builder'

import type { Chunk } from '../types/chunk'
import { createChunkId, hashContent } from './chunk-identity'
import { composeChunkText, paperLabel, topicLabel } from './compose-chunk-text'

// One chunk per question the examiner actually commented on, holding
// their commentary verbatim.
//
// Separate from the question chunk because it answers a different query.
// "What do candidates get wrong about refraction?" should retrieve the
// examiner's words, not a question about refraction; folding the two
// together would give every question a vector that is half what it asks
// and half how it went, and serve neither query well.
//
// Most multiple-choice questions produce nothing here. The report only
// discusses the notable ones, which is the source's ceiling, not a
// matching failure — the same honest-gap reasoning as the rest of
// Phase 4.
export function chunkExaminerInsights(document: KnowledgeDocument): Chunk[] {
  const paper = paperLabel(
    document.metadata.paper?.syllabusCode,
    document.metadata.paper?.code
  )

  return document.questions.flatMap((question) => {
    const commentary = question.examinerCommentary?.trim()
    if (!commentary || question.withdrawn) {
      return []
    }

    return [buildInsightChunk(question, commentary, document, paper)]
  })
}

function buildInsightChunk(
  question: KnowledgeQuestion,
  commentary: string,
  document: KnowledgeDocument,
  paper: string | undefined
): Chunk {
  const content = composeChunkText(
    [
      paper,
      topicLabel(question.topicNumber, question.topicName),
      `Question ${question.questionNumber}`,
      'Examiner commentary',
    ],
    commentary
  )

  return {
    id: createChunkId(
      document.metadata.resourceId,
      'examinerInsight',
      String(question.questionNumber)
    ),
    chunkType: 'examinerInsight',
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
      hasDiagram: false,
      // Commentary is the examiner's own prose, quoted whole. There is
      // no partial-extraction failure mode for it the way there is for
      // scattered multiple-choice options.
      isExemplar: true,
    },
    payload: {
      examinerCommentary: commentary,
      commonMistakes: question.commonMistakes,
    },
  }
}
