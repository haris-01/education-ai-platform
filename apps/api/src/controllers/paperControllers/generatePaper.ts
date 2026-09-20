import type { FastifyReply, FastifyRequest } from 'fastify'

import type { PaperSpec } from '@education-ai/exam-generation'

import { sendHttpResult } from '../../http/sendHttpResult'
import { isParsed, parseBody } from '../../http/validation'
import type { GeneratePaperDependencies } from '../../services/paperServices/generatePaper'
import { paperServices } from '../../services/paperServices'
import type { GeneratePaperBody } from './validators/generatePaperSchema'
import { generatePaperSchema } from './validators/generatePaperSchema'

// The controller's whole job: gate 4xx, and map validated HTTP input
// into a command. No domain logic, so the same generation can be driven
// from a job or a CLI without constructing a request.
export async function generatePaper(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: GeneratePaperDependencies
): Promise<FastifyReply> {
  const parsed = parseBody(generatePaperSchema, request.body)

  if (!isParsed(parsed)) {
    return sendHttpResult(reply, parsed)
  }

  const result = await paperServices.generatePaper(
    {
      spec: toSpec(parsed.value),
      multipleChoice: parsed.value.multipleChoice,
      excludeSourceDocumentIds: parsed.value.excludeSourceDocumentIds,
      exemplarsPerTopic: parsed.value.exemplarsPerTopic,
    },
    dependencies
  )

  return sendHttpResult(reply, result)
}

function toSpec(body: GeneratePaperBody): PaperSpec {
  return {
    syllabusCode: body.syllabusCode,
    title: body.title,
    modelledOnPaperCode: body.modelledOnPaperCode,
    totalMarks: body.totalMarks,
    topics: body.topics,
    assessmentObjectiveWeights: body.assessmentObjectiveWeights,
    difficultyMix: body.difficultyMix,
    tolerancePercent: body.tolerancePercent,
  }
}
