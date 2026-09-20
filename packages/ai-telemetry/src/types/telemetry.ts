import type { GoogleAiCallReport } from '@education-ai/google-ai'

export interface ModelCall extends GoogleAiCallReport {
  // What the call was for: 'embed', 'generate', 'diagram'. The path
  // says which endpoint was hit; this says why, which is the question
  // asked when a bill or a rate limit is being explained.
  operation: string
}

export interface UsageWindow {
  operation: string

  calls: number

  failures: number

  // Of the total, how many failed specifically because of quota. This
  // is the number that decides whether to pay for a tier.
  quotaFailures: number

  totalDurationMs: number

  // Of the total duration, how much was spent waiting out rate limits
  // rather than working.
  totalWaitedMs: number

  inputTokens: number

  outputTokens: number
}

export interface TelemetryStore {
  record(call: ModelCall): Promise<void>

  // Usage grouped by operation over the last `hours`.
  usage(hours: number): Promise<UsageWindow[]>

  close(): Promise<void>
}
