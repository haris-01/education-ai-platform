import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

import type { ModelCall, TelemetryStore, UsageWindow } from '../types/telemetry'

export const TELEMETRY_MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations'
)

export interface PgTelemetryStoreOptions {
  connectionString: string

  schema?: string

  // Called when recording itself fails. Telemetry must never break
  // the thing it measures: a failed insert is worth knowing about and
  // is not worth failing a paper over.
  onError?: (error: unknown) => void
}

interface UsageRow {
  operation: string
  calls: string
  failures: string
  quota_failures: string
  total_duration_ms: string
  total_waited_ms: string
  input_tokens: string
  output_tokens: string
}

export function createPgTelemetryStore(
  options: PgTelemetryStoreOptions
): TelemetryStore {
  const pool = new pg.Pool({ connectionString: options.connectionString })
  const table = qualifiedTable(options.schema)

  return {
    record: async (call: ModelCall) => {
      // Swallowed on purpose, and reported through onError. An
      // observability sink that can fail a request has made the system
      // less reliable than it was before anyone measured it.
      try {
        await pool.query(
          `INSERT INTO ${table} (
             path, operation, outcome, duration_ms, waited_ms, attempts,
             input_tokens, output_tokens
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            call.path,
            call.operation,
            call.outcome,
            call.durationMs,
            call.waitedMs,
            call.attempts,
            call.inputTokens ?? null,
            call.outputTokens ?? null,
          ]
        )
      } catch (error) {
        options.onError?.(error)
      }
    },

    usage: async (hours: number) => {
      const result = await pool.query<UsageRow>(
        `SELECT operation,
                COUNT(*)::text AS calls,
                COUNT(*) FILTER (WHERE outcome <> 'ok')::text AS failures,
                COUNT(*) FILTER (WHERE outcome = 'quota')::text AS quota_failures,
                COALESCE(SUM(duration_ms), 0)::text AS total_duration_ms,
                COALESCE(SUM(waited_ms), 0)::text AS total_waited_ms,
                COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::text AS output_tokens
           FROM ${table}
          WHERE occurred_at > NOW() - make_interval(hours => $1)
          GROUP BY operation
          ORDER BY operation`,
        [hours]
      )

      return result.rows.map(toWindow)
    },

    close: async () => {
      await pool.end()
    },
  }
}

// Counts come back as strings because COUNT and SUM are bigint, and
// pg refuses to silently narrow them.
function toWindow(row: UsageRow): UsageWindow {
  return {
    operation: row.operation,
    calls: Number(row.calls),
    failures: Number(row.failures),
    quotaFailures: Number(row.quota_failures),
    totalDurationMs: Number(row.total_duration_ms),
    totalWaitedMs: Number(row.total_waited_ms),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
  }
}

function qualifiedTable(schema: string | undefined): string {
  if (!schema) {
    return 'model_calls'
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`)
  }

  return `${schema}.model_calls`
}
