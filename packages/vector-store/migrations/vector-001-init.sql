-- Phase 5 — the embedding store.
--
-- One table. Metadata lives in real columns rather than inside the JSON
-- payload because filtering and ranking in a single query is the whole
-- reason for choosing a vector database over a file of vectors: Phase 6
-- asks for "the nearest questions on topic 3, worth 4+ marks, that are
-- not multiple choice", and that is one statement here.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embedding_chunks (
  -- "<sourceDocumentId>:<chunkType>:<key>", built by createChunkId.
  -- Deterministic, so re-running the pipeline updates rows in place.
  id                           TEXT PRIMARY KEY,

  chunk_type                   TEXT NOT NULL
    CHECK (chunk_type IN ('question', 'learningObjective', 'examinerInsight')),

  source_document_id           TEXT NOT NULL,

  -- Filterable metadata. Nullable because each chunk type knows a
  -- different subset: a learning objective has no paper or question
  -- number, a question has no syllabus section.
  syllabus_code                TEXT,
  paper_code                   TEXT,
  question_number              INTEGER,
  topic_number                 INTEGER,
  topic_name                   TEXT,
  sub_topic_number             TEXT,
  section_number               TEXT,
  tier                         TEXT CHECK (tier IN ('core', 'supplement')),
  assessment_objectives        TEXT[] NOT NULL DEFAULT '{}',
  primary_assessment_objective TEXT,
  difficulty                   TEXT
    CHECK (difficulty IN ('low', 'moderate', 'high')),
  marks                        INTEGER,
  has_diagram                  BOOLEAN NOT NULL DEFAULT FALSE,

  -- The exact text that was embedded, stored so a hit can be read back
  -- and quoted, and so a later model can be re-run on identical input.
  content                      TEXT NOT NULL,

  -- Retrievable but deliberately not embedded: marking points, options,
  -- commentary, element references.
  payload                      JSONB NOT NULL DEFAULT '{}'::jsonb,

  embedding_model              TEXT NOT NULL,

  -- SHA-256 of `content`. Embedding is the only step that costs money,
  -- so this is what lets a re-run skip it.
  content_hash                 TEXT NOT NULL,

  -- Fixed width, which is why changing embedder is a migration and not a
  -- config edit. 768 rather than the model's full 3072 because HNSW
  -- refuses to index anything wider than 2000 dimensions.
  embedding                    VECTOR(768) NOT NULL,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cosine, matching the distance the Embedder contract normalises for.
-- An index built for one operator class does not serve another, so this
-- and the `<=>` in searchSimilar have to agree.
CREATE INDEX IF NOT EXISTS embedding_chunks_embedding_idx
  ON embedding_chunks USING hnsw (embedding vector_cosine_ops);

-- The filters Phase 6 actually uses. Postgres can combine these with the
-- vector scan; without them a filtered search degrades to reading every
-- row that matches and re-ranking it.
CREATE INDEX IF NOT EXISTS embedding_chunks_chunk_type_idx
  ON embedding_chunks (chunk_type);
CREATE INDEX IF NOT EXISTS embedding_chunks_topic_number_idx
  ON embedding_chunks (topic_number);
CREATE INDEX IF NOT EXISTS embedding_chunks_paper_code_idx
  ON embedding_chunks (syllabus_code, paper_code);
CREATE INDEX IF NOT EXISTS embedding_chunks_source_document_idx
  ON embedding_chunks (source_document_id);
