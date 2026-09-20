import type { ApiErrorCode } from './apiErrorCodes'

export interface ApiErrorBody {
  code: ApiErrorCode

  message: string

  details?: unknown

  reasons?: string[]
}

export interface HttpSuccess<T> {
  ok: true

  statusCode: number

  body: {
    data: T
    meta: { operation: string }
  }
}

export interface HttpError {
  ok: false

  statusCode: number

  body: ApiErrorBody
}

export type HttpResult<T> = HttpSuccess<T> | HttpError

// Services and controllers return a discriminated result rather than
// throwing for expected 4xx. An exception is for the unexpected; "this
// paper does not exist" is an ordinary outcome of asking for a paper,
// and modelling it as a throw means every caller either catches or
// crashes.
export function httpSuccess<T>(
  data: T,
  operation: string,
  statusCode = 200
): HttpSuccess<T> {
  return { ok: true, statusCode, body: { data, meta: { operation } } }
}

export function httpError(input: {
  statusCode: number
  code: ApiErrorCode
  message: string
  details?: unknown
  reasons?: string[]
}): HttpError {
  return {
    ok: false,
    statusCode: input.statusCode,
    body: {
      code: input.code,
      message: input.message,
      details: input.details,
      reasons: input.reasons,
    },
  }
}

export function isHttpErrorResult<T>(
  result: HttpResult<T>
): result is HttpError {
  return !result.ok
}
