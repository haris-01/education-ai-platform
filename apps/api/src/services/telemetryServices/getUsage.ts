import type { TelemetryStore, UsageWindow } from '@education-ai/ai-telemetry'

import type { HttpResult } from '../../http/httpResult'
import { httpSuccess } from '../../http/httpResult'

export interface UsageReport {
  windowHours: number

  operations: UsageWindow[]

  totals: {
    calls: number
    failures: number
    quotaFailures: number
    inputTokens: number
    outputTokens: number

    // The share of wall-clock time spent waiting out rate limits. The
    // single most useful number this system produces about itself:
    // above about half, the limit is the bottleneck and no amount of
    // optimising the code will help.
    waitedShare: number
  }
}

export async function getUsage(
  windowHours: number,
  store: TelemetryStore
): Promise<HttpResult<UsageReport>> {
  const operations = await store.usage(windowHours)

  const sum = (pick: (entry: UsageWindow) => number): number =>
    operations.reduce((total, entry) => total + pick(entry), 0)

  const duration = sum((entry) => entry.totalDurationMs)
  const waited = sum((entry) => entry.totalWaitedMs)

  return httpSuccess(
    {
      windowHours,
      operations,
      totals: {
        calls: sum((entry) => entry.calls),
        failures: sum((entry) => entry.failures),
        quotaFailures: sum((entry) => entry.quotaFailures),
        inputTokens: sum((entry) => entry.inputTokens),
        outputTokens: sum((entry) => entry.outputTokens),
        waitedShare: duration === 0 ? 0 : waited / duration,
      },
    },
    'telemetry.usageRead'
  )
}
