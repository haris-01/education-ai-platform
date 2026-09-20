import type { ZodType } from 'zod'

import { API_ERROR_CODE } from './apiErrorCodes'
import type { HttpError } from './httpResult'
import { httpError } from './httpResult'

export interface Parsed<T> {
  ok: true
  value: T
}

// Validation happens in the controller, never in a service. A service
// that parses request bodies cannot be called from a job, a CLI or a
// test without constructing a fake request — which is how business
// logic ends up welded to HTTP.
export function parseBody<T>(
  schema: ZodType<T>,
  body: unknown
): Parsed<T> | HttpError {
  const parsed = schema.safeParse(body)

  if (parsed.success) {
    return { ok: true, value: parsed.data }
  }

  return httpError({
    statusCode: 400,
    code: API_ERROR_CODE.REQUEST_VALIDATION_FAILED,
    message: 'The request body is not valid.',
    details: parsed.error.flatten(),
  })
}

export function isParsed<T>(
  result: Parsed<T> | HttpError
): result is Parsed<T> {
  return result.ok
}
