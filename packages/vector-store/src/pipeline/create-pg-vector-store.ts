import pg from 'pg'

import type { Chunk, EmbeddingChunk } from '@education-ai/embeddings'

import type { SearchHit, VectorStore } from '../types/vector-store'
import { buildSearchQuery } from './build-search-query'
import { formatVector } from './format-vector'

const DEFAULT_LIMIT = 10

// Shared by both searches so a column added to one cannot go missing
// from the other.
const SELECT_COLUMNS = `id, chunk_type, source_document_id, syllabus_code,
                        paper_code, question_number, topic_number, topic_name,
                        sub_topic_number, section_number, tier,
                        assessment_objectives, primary_assessment_objective,
                        difficulty, marks, has_diagram, is_exemplar,
                        content, payload`

export interface PgVectorStoreOptions {
  connectionString: string

  // Schema to read and write. Integration tests point this at a
  // throwaway schema so they never touch a developer's own data.
  schema?: string
}

interface ChunkRow {
  id: string
  chunk_type: string
  source_document_id: string
  syllabus_code: string | null
  paper_code: string | null
  question_number: number | null
  topic_number: number | null
  topic_name: string | null
  sub_topic_number: string | null
  section_number: string | null
  tier: string | null
  assessment_objectives: string[]
  primary_assessment_objective: string | null
  difficulty: string | null
  marks: number | null
  has_diagram: boolean
  is_exemplar: boolean
  content: string
  payload: SearchHit['payload']
  distance: number
  lexical_score: number
}

export function createPgVectorStore(
  options: PgVectorStoreOptions
): VectorStore {
  const pool = new pg.Pool({ connectionString: options.connectionString })
  const table = qualifiedTable(options.schema)

  return {
    upsertChunks: async (chunks) => {
      if (chunks.length === 0) {
        return 0
      }

      // Sequential inside one transaction rather than one multi-row
      // statement: a paper is a few hundred rows, and a row-per-statement
      // keeps the parameter count well under Postgres's 65535 limit
      // without needing to reason about batch sizes.
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await chunks.reduce(async (previous, chunk) => {
          await previous
          await client.query(upsertSql(table), upsertParams(chunk))
        }, Promise.resolve() as Promise<void>)
        await client.query('COMMIT')
        return chunks.length
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    refreshMetadata: async (chunks) => {
      if (chunks.length === 0) {
        return 0
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const counts = await chunks.reduce<Promise<number>>(
          async (previous, chunk) => {
            const total = await previous
            const result = await client.query(
              refreshSql(table),
              refreshParams(chunk)
            )
            return total + (result.rowCount ?? 0)
          },
          Promise.resolve(0)
        )
        await client.query('COMMIT')
        return counts
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    searchSimilar: async (queryVector, filter, limit = DEFAULT_LIMIT) => {
      const vector = formatVector(queryVector)
      const { clauses, params } = buildSearchQuery(filter, 2)
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const result = await pool.query<ChunkRow>(
        `SELECT ${SELECT_COLUMNS},
                embedding <=> $1::vector AS distance,
                0 AS lexical_score
           FROM ${table}
           ${where}
          ORDER BY embedding <=> $1::vector
          LIMIT $${params.length + 2}`,
        [vector, ...params, limit]
      )

      return result.rows.map(toSearchHit)
    },

    deleteMissing: async (sourceDocumentIds, keepIds) => {
      if (sourceDocumentIds.length === 0) {
        return 0
      }

      const result = await pool.query(
        `DELETE FROM ${table}
          WHERE source_document_id = ANY($1)
            AND NOT (id = ANY($2))`,
        [sourceDocumentIds, keepIds]
      )

      return result.rowCount ?? 0
    },

    listChunks: async (filter, limit = DEFAULT_LIMIT) => {
      const { clauses, params } = buildSearchQuery(filter, 1)
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      // Ordered by the syllabus's own numbering where it exists, then by
      // id, so a list is reproducible rather than whatever order the
      // heap happened to be in.
      const result = await pool.query<ChunkRow>(
        `SELECT ${SELECT_COLUMNS}, 0 AS distance, 0 AS lexical_score
           FROM ${table}
           ${where}
          ORDER BY topic_number NULLS LAST, sub_topic_number NULLS LAST,
                   section_number NULLS LAST, question_number NULLS LAST, id
          LIMIT $${params.length + 1}`,
        [...params, limit]
      )

      return result.rows.map((row) => ({
        ...toSearchHit(row),
        distance: undefined,
      }))
    },

    searchSimilarToChunk: async (chunkId, filter, limit = DEFAULT_LIMIT) => {
      const { clauses, params } = buildSearchQuery(filter, 2)
      const conditions = [
        'id <> $1',
        // Without this, a seed id that is not in the table makes the
        // subquery NULL, `embedding <=> NULL` NULL, and the ordering
        // undefined — so the query returns arbitrary rows that look
        // exactly like neighbours. A mistyped id should find nothing,
        // loudly, rather than something plausible.
        `EXISTS (SELECT 1 FROM ${table} WHERE id = $1)`,
        ...clauses,
      ]
      const seedIndex = params.length + 2

      // The seed vector is read in a subquery rather than fetched and
      // sent back: 768 floats do not need a round trip to reach a query
      // running on the same rows.
      const result = await pool.query<ChunkRow>(
        `SELECT ${SELECT_COLUMNS},
                embedding <=> (SELECT embedding FROM ${table} WHERE id = $1)
                  AS distance,
                0 AS lexical_score
           FROM ${table}
          WHERE ${conditions.join(' AND ')}
          ORDER BY embedding <=> (SELECT embedding FROM ${table} WHERE id = $1)
          LIMIT $${seedIndex}`,
        [chunkId, ...params, limit]
      )

      return result.rows.map(toSearchHit)
    },

    searchLexical: async (queryText, filter, limit = DEFAULT_LIMIT) => {
      const { clauses, params } = buildSearchQuery(filter, 2)
      const conditions = [
        "content_tsv @@ plainto_tsquery('english', $1)",
        ...clauses,
      ]

      const result = await pool.query<ChunkRow>(
        `SELECT ${SELECT_COLUMNS},
                0 AS distance,
                ts_rank(content_tsv, plainto_tsquery('english', $1)) AS lexical_score
           FROM ${table}
          WHERE ${conditions.join(' AND ')}
          ORDER BY lexical_score DESC
          LIMIT $${params.length + 2}`,
        [queryText, ...params, limit]
      )

      return result.rows.map((row) => ({
        ...toSearchHit(row),
        distance: undefined,
        lexicalScore: Number(row.lexical_score),
      }))
    },

    getStoredHashes: async (sourceDocumentIds) => {
      if (sourceDocumentIds.length === 0) {
        return new Map()
      }

      const result = await pool.query<{ id: string; content_hash: string }>(
        `SELECT id, content_hash FROM ${table}
          WHERE source_document_id = ANY($1)`,
        [sourceDocumentIds]
      )

      return new Map(result.rows.map((row) => [row.id, row.content_hash]))
    },

    close: async () => {
      await pool.end()
    },
  }
}

// Interpolated rather than parameterised because an identifier cannot be
// a bind parameter. It is validated instead: this only ever comes from
// config or a test, never from a request, and a quiet injection point in
// the one place SQL is built by hand is not worth the convenience.
function qualifiedTable(schema: string | undefined): string {
  if (!schema) {
    return 'embedding_chunks'
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`)
  }

  return `${schema}.embedding_chunks`
}

function upsertSql(table: string): string {
  return `INSERT INTO ${table} (
            id, chunk_type, source_document_id, syllabus_code, paper_code,
            question_number, topic_number, topic_name, sub_topic_number,
            section_number, tier, assessment_objectives,
            primary_assessment_objective, difficulty, marks, has_diagram,
            is_exemplar, content, payload, embedding_model, content_hash,
            embedding
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19::jsonb, $20, $21, $22::vector
          )
          ON CONFLICT (id) DO UPDATE SET
            chunk_type = EXCLUDED.chunk_type,
            source_document_id = EXCLUDED.source_document_id,
            syllabus_code = EXCLUDED.syllabus_code,
            paper_code = EXCLUDED.paper_code,
            question_number = EXCLUDED.question_number,
            topic_number = EXCLUDED.topic_number,
            topic_name = EXCLUDED.topic_name,
            sub_topic_number = EXCLUDED.sub_topic_number,
            section_number = EXCLUDED.section_number,
            tier = EXCLUDED.tier,
            assessment_objectives = EXCLUDED.assessment_objectives,
            primary_assessment_objective = EXCLUDED.primary_assessment_objective,
            difficulty = EXCLUDED.difficulty,
            marks = EXCLUDED.marks,
            has_diagram = EXCLUDED.has_diagram,
            is_exemplar = EXCLUDED.is_exemplar,
            content = EXCLUDED.content,
            payload = EXCLUDED.payload,
            embedding_model = EXCLUDED.embedding_model,
            content_hash = EXCLUDED.content_hash,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()`
}

// Everything an upsert writes except the vector, the content it was
// built from, and the hash identifying it — those three are exactly the
// things that have not changed when this is the right call to make.
function refreshSql(table: string): string {
  return `UPDATE ${table} SET
            chunk_type = $2,
            source_document_id = $3,
            syllabus_code = $4,
            paper_code = $5,
            question_number = $6,
            topic_number = $7,
            topic_name = $8,
            sub_topic_number = $9,
            section_number = $10,
            tier = $11,
            assessment_objectives = $12,
            primary_assessment_objective = $13,
            difficulty = $14,
            marks = $15,
            has_diagram = $16,
            is_exemplar = $17,
            payload = $18::jsonb,
            updated_at = NOW()
          WHERE id = $1`
}

function refreshParams(chunk: Chunk): unknown[] {
  const { metadata } = chunk

  return [
    chunk.id,
    chunk.chunkType,
    chunk.sourceDocumentId,
    metadata.syllabusCode ?? null,
    metadata.paperCode ?? null,
    metadata.questionNumber ?? null,
    metadata.topicNumber ?? null,
    metadata.topicName ?? null,
    metadata.subTopicNumber ?? null,
    metadata.sectionNumber ?? null,
    metadata.tier ?? null,
    metadata.assessmentObjectives,
    metadata.primaryAssessmentObjective ?? null,
    metadata.difficulty ?? null,
    metadata.marks ?? null,
    metadata.hasDiagram,
    metadata.isExemplar,
    JSON.stringify(chunk.payload),
  ]
}

function upsertParams(chunk: EmbeddingChunk): unknown[] {
  const { metadata } = chunk

  return [
    chunk.id,
    chunk.chunkType,
    chunk.sourceDocumentId,
    metadata.syllabusCode ?? null,
    metadata.paperCode ?? null,
    metadata.questionNumber ?? null,
    metadata.topicNumber ?? null,
    metadata.topicName ?? null,
    metadata.subTopicNumber ?? null,
    metadata.sectionNumber ?? null,
    metadata.tier ?? null,
    metadata.assessmentObjectives,
    metadata.primaryAssessmentObjective ?? null,
    metadata.difficulty ?? null,
    metadata.marks ?? null,
    metadata.hasDiagram,
    metadata.isExemplar,
    chunk.content,
    JSON.stringify(chunk.payload),
    chunk.embeddingModel,
    chunk.contentHash,
    formatVector(chunk.embedding),
  ]
}

function toSearchHit(row: ChunkRow): SearchHit {
  return {
    id: row.id,
    chunkType: row.chunk_type as SearchHit['chunkType'],
    sourceDocumentId: row.source_document_id,
    content: row.content,
    metadata: {
      syllabusCode: orUndefined(row.syllabus_code),
      paperCode: orUndefined(row.paper_code),
      questionNumber: orUndefined(row.question_number),
      topicNumber: orUndefined(row.topic_number),
      topicName: orUndefined(row.topic_name),
      subTopicNumber: orUndefined(row.sub_topic_number),
      sectionNumber: orUndefined(row.section_number),
      tier: orUndefined(row.tier) as SearchHit['metadata']['tier'],
      assessmentObjectives: row.assessment_objectives,
      primaryAssessmentObjective: orUndefined(row.primary_assessment_objective),
      difficulty: orUndefined(row.difficulty) as
        SearchHit['metadata']['difficulty'] | undefined,
      marks: orUndefined(row.marks),
      hasDiagram: row.has_diagram,
      isExemplar: row.is_exemplar,
    },
    payload: row.payload,
    distance: Number(row.distance),
  }
}

// Postgres returns NULL for an absent value; the chunk contract uses
// `undefined`. Converting at the boundary keeps every consumer from
// having to handle both.
function orUndefined<T>(value: T | null): T | undefined {
  if (value === null) {
    return undefined
  }

  return value
}
