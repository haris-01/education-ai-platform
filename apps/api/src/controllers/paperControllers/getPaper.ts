import type { FastifyReply, FastifyRequest } from 'fastify'

import type { PaperStore } from '@education-ai/paper-store'

import { sendHttpResult } from '../../http/sendHttpResult'
import { paperServices } from '../../services/paperServices'

export async function getPaper(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  paperStore: PaperStore
): Promise<FastifyReply> {
  return sendHttpResult(
    reply,
    await paperServices.getPaper(request.params.id, paperStore)
  )
}
