// Stable, machine-readable identifiers. Clients branch on these, never
// on a status alone or on English message text — a message is copy and
// will be reworded.
export const API_ERROR_CODE = {
  REQUEST_VALIDATION_FAILED: 'REQUEST_VALIDATION_FAILED',
  PAPER_NOT_FOUND: 'PAPER_NOT_FOUND',
  CORPUS_EMPTY: 'CORPUS_EMPTY',
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATOR_UNAVAILABLE: 'GENERATOR_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE]
