import type { FastifyReply, FastifyRequest } from 'fastify'

import type { TelemetryStore } from '@education-ai/ai-telemetry'

import { sendHttpResult } from '../../http/sendHttpResult'
import { telemetryServices } from '../../services/telemetryServices'

const DEFAULT_WINDOW_HOURS = 24

const MAX_WINDOW_HOURS = 24 * 90

export async function getUsage(
  request: FastifyRequest<{ Querystring: { hours?: string } }>,
  reply: FastifyReply,
  store: TelemetryStore
): Promise<FastifyReply> {
  return sendHttpResult(
    reply,
    await telemetryServices.getUsage(readHours(request.query.hours), store)
  )
}

// Clamped rather than rejected. A nonsense window is not worth a 400
// on a read-only metrics endpoint, and an unbounded one is a way to
// ask the database to scan everything.
function readHours(raw: string | undefined): number {
  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WINDOW_HOURS
  }

  return Math.min(parsed, MAX_WINDOW_HOURS)
}
