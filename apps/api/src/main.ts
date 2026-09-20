import {
  TELEMETRY_MIGRATIONS_DIR,
  createPgTelemetryStore,
} from '@education-ai/ai-telemetry'
import type { TelemetryStore } from '@education-ai/ai-telemetry'
import {
  createFakeGenerator,
  createGeminiGenerator,
} from '@education-ai/exam-generation'
import type { QuestionGenerator } from '@education-ai/exam-generation'
import {
  PAPER_MIGRATIONS_DIR,
  createPgPaperStore,
} from '@education-ai/paper-store'
import { isCliEntrypoint } from '@education-ai/shared'
import { createPgVectorStore, runMigrations } from '@education-ai/vector-store'

import { buildServer } from './buildServer'
import { readConfig } from './config/environment'

async function main(): Promise<void> {
  const config = readConfig()

  // Each module owns its schema; the runner is generic. Running them at
  // startup keeps "the database matches this build" true without a
  // separate deploy step to forget.
  await runMigrations({ connectionString: config.databaseUrl })
  await runMigrations({
    connectionString: config.databaseUrl,
    migrationsDir: PAPER_MIGRATIONS_DIR,
  })
  await runMigrations({
    connectionString: config.databaseUrl,
    migrationsDir: TELEMETRY_MIGRATIONS_DIR,
  })

  const vectorStore = createPgVectorStore({
    connectionString: config.databaseUrl,
  })
  const paperStore = createPgPaperStore({
    connectionString: config.databaseUrl,
  })
  const telemetryStore = createPgTelemetryStore({
    connectionString: config.databaseUrl,
    onError: (error) => console.error('[telemetry] failed to record', error),
  })

  const app = buildServer({
    vectorStore,
    paperStore,
    telemetryStore,
    generator: chooseGenerator(config, telemetryStore),
    logger: true,
  })

  const close = async (): Promise<void> => {
    await app.close()
    await vectorStore.close()
    await paperStore.close()
    await telemetryStore.close()
  }

  // Without this a container restart drops in-flight requests and
  // leaks connections, which shows up later as a pool that will not
  // hand out clients.
  process.on('SIGTERM', () => void close().then(() => process.exit(0)))
  process.on('SIGINT', () => void close().then(() => process.exit(0)))

  await app.listen({ port: config.port, host: config.host })
}

function chooseGenerator(
  config: ReturnType<typeof readConfig>,
  telemetryStore: TelemetryStore
): QuestionGenerator {
  if (config.useFakeGenerator || !config.geminiApiKey) {
    return createFakeGenerator()
  }

  return createGeminiGenerator({
    apiKey: config.geminiApiKey,
    // Recorded here rather than inside the generator: the transport
    // reports what a call cost, and what the call was *for* is only
    // known at the place that made it.
    onCall: (report) =>
      void telemetryStore.record({ ...report, operation: 'generate' }),
  })
}

if (isCliEntrypoint(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
