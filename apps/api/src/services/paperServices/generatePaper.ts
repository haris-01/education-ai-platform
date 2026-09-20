import { randomUUID } from 'node:crypto'

import type {
  GeneratePaperResult,
  PaperSpec,
  QuestionGenerator,
} from '@education-ai/exam-generation'
import { generatePaper as runGeneration } from '@education-ai/exam-generation'
import type { PaperStore, StoredPaper } from '@education-ai/paper-store'
import type { VectorStore } from '@education-ai/vector-store'
import { retrieveForGeneration } from '@education-ai/vector-store'

import { API_ERROR_CODE } from '../../http/apiErrorCodes'
import type { HttpResult } from '../../http/httpResult'
import { httpError, httpSuccess } from '../../http/httpResult'

export interface GeneratePaperCommand {
  spec: PaperSpec

  multipleChoice: boolean

  // Papers not to retrieve from, so a replacement is not a paraphrase
  // of the paper it replaces.
  excludeSourceDocumentIds: string[]

  exemplarsPerTopic: number
}

export interface GeneratePaperDependencies {
  vectorStore: VectorStore

  paperStore: PaperStore

  generator: QuestionGenerator
}

export interface GeneratePaperResponse {
  id: string

  paper: GeneratePaperResult['paper']

  validation: GeneratePaperResult['validation']

  originality: GeneratePaperResult['originality']

  retrievalShortfalls: string[]
}

// Retrieve, generate, check, store.
//
// A paper that fails validation is still stored and still returned with
// a 201. That is deliberate: it is a real artefact that was really
// produced, the caller needs to see why it failed to decide what to do,
// and discarding it would make "regenerate the weak topics" impossible.
// The validation report answers "is this usable", not the status code.
export async function generatePaper(
  command: GeneratePaperCommand,
  dependencies: GeneratePaperDependencies
): Promise<HttpResult<GeneratePaperResponse>> {
  const { vectorStore, paperStore, generator } = dependencies

  const context = await retrieveForGeneration({
    store: vectorStore,
    syllabusCode: command.spec.syllabusCode,
    topics: command.spec.topics.map((topic) => ({
      topicNumber: topic.topicNumber,
      exemplars: command.exemplarsPerTopic,
    })),
    excludeSourceDocumentIds: command.excludeSourceDocumentIds,
  })

  const retrieved = context.topics.reduce(
    (total, topic) => total + topic.exemplars.length,
    0
  )

  // Nothing retrieved means an unindexed corpus, not a hard question.
  // Generating anyway would produce a paper invented from the prompt
  // alone, which is exactly what this system exists not to do.
  if (retrieved === 0) {
    return httpError({
      statusCode: 409,
      code: API_ERROR_CODE.CORPUS_EMPTY,
      message:
        'No exemplar questions were retrieved for any requested topic. Index a corpus before generating.',
      reasons: context.shortfalls,
    })
  }

  const result = await runGeneration({
    spec: command.spec,
    context,
    generator,
    multipleChoice: command.multipleChoice,
  })

  const stored: StoredPaper = {
    id: randomUUID(),
    paper: result.paper,
    validation: result.validation,
    originality: result.originality,
    createdAt: new Date(),
  }

  await paperStore.save(stored)

  return httpSuccess(
    {
      id: stored.id,
      paper: result.paper,
      validation: result.validation,
      originality: result.originality,
      retrievalShortfalls: result.retrievalShortfalls,
    },
    'paper.generated',
    201
  )
}
