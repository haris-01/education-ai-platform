export interface ApiConfig {
  port: number

  host: string

  databaseUrl: string

  // Absent means the API can still retrieve, store and render — only
  // real generation is unavailable, and it says so with a 503 rather
  // than failing at the model call.
  geminiApiKey?: string

  // Set to use the deterministic fake generator regardless of key.
  // Lets the whole API be exercised end to end with no model, which is
  // how its own tests run.
  useFakeGenerator: boolean
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and run `pnpm db:up`.'
    )
  }

  return {
    port: Number(env.PORT ?? 3333),
    host: env.HOST ?? '127.0.0.1',
    databaseUrl,
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    useFakeGenerator: env.USE_FAKE_GENERATOR === '1',
  }
}
