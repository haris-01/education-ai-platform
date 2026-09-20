import type { FastifyReply, FastifyRequest } from 'fastify'

import type { PaperStore } from '@education-ai/paper-store'

import { sendHttpResult } from '../../http/sendHttpResult'
import { paperServices } from '../../services/paperServices'

export async function getAllPapers(
  request: FastifyRequest<{ Querystring: { syllabusCode?: string } }>,
  reply: FastifyReply,
  paperStore: PaperStore
): Promise<FastifyReply> {
  return sendHttpResult(
    reply,
    await paperServices.getAllPapers(request.query.syllabusCode, paperStore)
  )
}
