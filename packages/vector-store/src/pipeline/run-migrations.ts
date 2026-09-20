import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const DEFAULT_MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations'
)

const HISTORY_TABLE = 'schema_migrations'

export interface RunMigrationsOptions {
  connectionString: string

  // Applied into this schema instead of the default. Integration tests
  // use it to get a throwaway copy of the schema per run.
  schema?: string

  // Where the .sql files live. Defaults to this package's own.
  //
  // Other modules own their own schema and pass their own directory:
  // the runner is generic, and making every table in the system live
  // in the vector store's migrations would couple modules that have
  // nothing to do with each other. Filenames share one history table,
  // so they are prefixed per module to stay distinct.
  migrationsDir?: string
}

// Applies every .sql file in migrations/ that has not been applied yet,
// in filename order, each in its own transaction, recording what ran.
//
// The first version had no history table, on the reasoning that there
// was one migration and every statement in it was `IF NOT EXISTS`. That
// reasoning expired the moment there was a second file: it only holds
// while every migration is hand-written to be idempotent, and relying on
// that forever is relying on nobody ever writing a plain UPDATE. The
// table costs fifteen lines and removes the whole class of bug.
//
// Returns the files applied by this run — empty when everything is
// already up to date.
export async function runMigrations(
  options: RunMigrationsOptions
): Promise<string[]> {
  const client = new pg.Client({ connectionString: options.connectionString })
  await client.connect()

  try {
    return await applyPending(
      client,
      options.schema,
      options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR
    )
  } finally {
    await client.end()
  }
}

async function applyPending(
  client: pg.Client,
  schema: string | undefined,
  migrationsDir: string
): Promise<string[]> {
  await prepareSchema(client, schema)

  await client.query(
    `CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
       filename    TEXT PRIMARY KEY,
       applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  )

  const applied = await client.query<{ filename: string }>(
    `SELECT filename FROM ${HISTORY_TABLE}`
  )
  const done = new Set(applied.rows.map((row) => row.filename))

  const pending = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => !done.has(file))

  return pending.reduce<Promise<string[]>>(async (previous, file) => {
    const ran = await previous
    const sql = await readFile(path.join(migrationsDir, file), 'utf8')

    // One transaction per migration: a file that fails half way leaves
    // nothing behind and is not recorded, so the next run retries it
    // rather than skipping a half-applied change.
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query(
        `INSERT INTO ${HISTORY_TABLE} (filename) VALUES ($1)`,
        [file]
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

    return [...ran, file]
  }, Promise.resolve([]))
}

async function prepareSchema(
  client: pg.Client,
  schema: string | undefined
): Promise<void> {
  if (!schema) {
    return
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`)
  }

  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  // The vector extension is database-wide, so it is created in public
  // and reached through the search path rather than installed once per
  // test schema.
  await client.query(`SET search_path TO ${schema}, public`)
}
