import type { FastifyReply } from 'fastify'

import type { HttpResult } from './httpResult'

export function sendHttpResult<T>(
  reply: FastifyReply,
  result: HttpResult<T>
): FastifyReply {
  return reply.status(result.statusCode).send(result.body)
}
