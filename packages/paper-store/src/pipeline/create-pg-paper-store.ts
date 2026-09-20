import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

import type {
  PaperStore,
  PaperSummary,
  StoredPaper,
} from '../types/paper-store'

// Exported so a caller can hand it to the migration runner. The runner
// is generic; each module owns its own schema.
export const PAPER_MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations'
)

const DEFAULT_LIST_LIMIT = 50

export interface PgPaperStoreOptions {
  connectionString: string

  schema?: string
}

interface PaperRow {
  id: string
  syllabus_code: string
  title: string
  total_marks: number
  question_count: number
  generator_model: string
  paper: StoredPaper['paper']
  validation: StoredPaper['validation']
  originality: StoredPaper['originality']
  created_at: Date
}

export function createPgPaperStore(options: PgPaperStoreOptions): PaperStore {
  const pool = new pg.Pool({ connectionString: options.connectionString })
  const table = qualifiedTable(options.schema)

  return {
    save: async (stored) => {
      // Upsert rather than insert: saving the same paper twice is a
      // retry, not a second paper, and an id collision should not
      // surface to a caller as a database error.
      await pool.query(
        `INSERT INTO ${table} (
           id, syllabus_code, title, total_marks, question_count,
           generator_model, paper, validation, originality, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
         ON CONFLICT (id) DO UPDATE SET
           paper = EXCLUDED.paper,
           validation = EXCLUDED.validation,
           originality = EXCLUDED.originality`,
        [
          stored.id,
          stored.paper.syllabusCode,
          stored.paper.title,
          stored.paper.totalMarks,
          stored.paper.questions.length,
          stored.paper.generatorModel,
          JSON.stringify(stored.paper),
          JSON.stringify(stored.validation),
          JSON.stringify(stored.originality),
          stored.createdAt,
        ]
      )
    },

    find: async (id) => {
      const result = await pool.query<PaperRow>(
        `SELECT * FROM ${table} WHERE id = $1`,
        [id]
      )
      const row = result.rows[0]

      if (!row) {
        return undefined
      }

      return {
        id: row.id,
        // Dates do not survive JSON. Without this, `generatedAt` comes
        // back as a string wearing a Date's type, and the first thing
        // to call a Date method on it fails somewhere unrelated.
        paper: {
          ...row.paper,
          generatedAt: new Date(row.paper.generatedAt),
        },
        validation: row.validation,
        originality: row.originality,
        createdAt: row.created_at,
      }
    },

    list: async (syllabusCode, limit = DEFAULT_LIST_LIMIT) => {
      const filtered = syllabusCode !== undefined
      const result = await pool.query<PaperRow & { valid: boolean }>(
        `SELECT id, syllabus_code, title, total_marks, question_count,
                generator_model, created_at,
                (validation->>'valid')::boolean AS valid
           FROM ${table}
           ${filtered ? 'WHERE syllabus_code = $1' : ''}
          ORDER BY created_at DESC
          LIMIT $${filtered ? 2 : 1}`,
        filtered ? [syllabusCode, limit] : [limit]
      )

      return result.rows.map(toSummary)
    },

    close: async () => {
      await pool.end()
    },
  }
}

function toSummary(row: PaperRow & { valid: boolean }): PaperSummary {
  return {
    id: row.id,
    syllabusCode: row.syllabus_code,
    title: row.title,
    totalMarks: row.total_marks,
    questionCount: row.question_count,
    generatorModel: row.generator_model,
    valid: row.valid,
    createdAt: row.created_at,
  }
}

// Interpolated because an identifier cannot be a bind parameter, so it
// is validated instead. It only ever comes from config or a test.
function qualifiedTable(schema: string | undefined): string {
  if (!schema) {
    return 'generated_papers'
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`)
  }

  return `${schema}.generated_papers`
}
