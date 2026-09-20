import { isCliEntrypoint } from '@education-ai/shared'

import { runMigrations } from '../pipeline/run-migrations'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Copy .env.example to .env, then run with --env-file=.env'
    )
    process.exitCode = 1
    return
  }

  const applied = await runMigrations({ connectionString })
  applied.forEach((file) => console.info(`applied ${file}`))
}

if (isCliEntrypoint(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
