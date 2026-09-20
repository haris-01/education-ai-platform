import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ModelCall, TelemetryStore } from '../types/telemetry'
import {
  TELEMETRY_MIGRATIONS_DIR,
  createPgTelemetryStore,
} from './create-pg-telemetry-store'

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgresql://education_ai:education_ai@127.0.0.1:5433/education_ai'
const TEST_SCHEMA = 'telemetry_test'

const databaseAvailable = await isReachable(CONNECTION_STRING)

function call(overrides: Partial<ModelCall> = {}): ModelCall {
  return {
    path: 'models/gemini-3.5-flash:generateContent',
    operation: 'generate',
    outcome: 'ok',
    durationMs: 1200,
    waitedMs: 0,
    attempts: 1,
    inputTokens: 100,
    outputTokens: 50,
    ...overrides,
  }
}

describe.skipIf(!databaseAvailable)('pgTelemetryStore', () => {
  if (!databaseAvailable) {
    console.info('[telemetry.integration.test] skipped — no Postgres')
  }

  let store: TelemetryStore

  beforeAll(async () => {
    const { runMigrations } = await import('@education-ai/vector-store')
    await runMigrations({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
      migrationsDir: TELEMETRY_MIGRATIONS_DIR,
    })
    store = createPgTelemetryStore({
      connectionString: CONNECTION_STRING,
      schema: TEST_SCHEMA,
    })
    await truncate()
  }, 60000)

  afterAll(async () => {
    await store?.close()
    if (databaseAvailable) {
      await withClient((client) =>
        client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
      )
    }
  })

  it('aggregates usage per operation', async () => {
    await truncate()
    await store.record(call({ operation: 'embed', inputTokens: 40 }))
    await store.record(call({ operation: 'embed', inputTokens: 60 }))
    await store.record(call({ operation: 'generate' }))

    const usage = await store.usage(24)

    expect(usage.map((entry) => entry.operation)).toEqual(['embed', 'generate'])
    expect(usage[0]).toMatchObject({ calls: 2, inputTokens: 100 })
  })

  it('separates waiting from working, which is the whole point', async () => {
    // "Generation is slow" and "we are rate limited" are invisible in
    // a total duration and call for opposite responses.
    await truncate()
    await store.record(
      call({ operation: 'embed', durationMs: 300_000, waitedMs: 280_000 })
    )

    const [usage] = await store.usage(24)

    expect(usage.totalDurationMs).toBe(300_000)
    expect(usage.totalWaitedMs).toBe(280_000)
  })

  it('counts quota failures apart from other failures', async () => {
    // This is the number that decides whether to pay for a tier.
    await truncate()
    await store.record(call({ outcome: 'quota' }))
    await store.record(call({ outcome: 'error' }))
    await store.record(call({ outcome: 'ok' }))

    const [usage] = await store.usage(24)

    expect(usage).toMatchObject({ calls: 3, failures: 2, quotaFailures: 1 })
  })

  it('records absent token counts as unknown, not as zero', async () => {
    // batchEmbedContents reports no usage, and a cost report that
    // treats unknown as zero is worse than one that says so.
    await truncate()
    await store.record(
      call({ inputTokens: undefined, outputTokens: undefined })
    )

    const stored = await withClient(async (client) => {
      const result = await client.query<{ input_tokens: number | null }>(
        `SELECT input_tokens FROM ${TEST_SCHEMA}.model_calls`
      )
      return result.rows[0]
    })

    expect(stored.input_tokens).toBeNull()
  })

  it('excludes calls outside the window', async () => {
    await truncate()
    await store.record(call())
    await withClient((client) =>
      client.query(
        `UPDATE ${TEST_SCHEMA}.model_calls SET occurred_at = NOW() - INTERVAL '3 days'`
      )
    )

    expect(await store.usage(24)).toEqual([])
    expect((await store.usage(24 * 7))[0].calls).toBe(1)
  })

  it('never lets a recording failure break the thing it measures', async () => {
    // An observability sink that can fail a request has made the
    // system less reliable than it was before anyone measured it.
    const errors: unknown[] = []
    const broken = createPgTelemetryStore({
      connectionString: CONNECTION_STRING,
      schema: 'schema_that_does_not_exist',
      onError: (error) => errors.push(error),
    })

    await expect(broken.record(call())).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)

    await broken.close()
  })
})

async function isReachable(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.end()
    return true
  } catch {
    return false
  }
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: CONNECTION_STRING })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function truncate(): Promise<void> {
  await withClient((client) =>
    client.query(`TRUNCATE ${TEST_SCHEMA}.model_calls`)
  )
}
