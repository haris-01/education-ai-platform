-- Generated papers, kept so they can be fetched, re-rendered and
-- audited after the call that produced them.
--
-- The paper is stored as JSONB rather than shredded into tables of
-- questions, parts and mark points. It is written once and read whole:
-- nothing queries "all questions worth 4 marks across every paper", and
-- normalising for a query nobody makes would buy five tables and a join
-- in exchange for nothing. The columns beside it are the ones a caller
-- genuinely filters on.
--
-- Filenames are module-prefixed because every module's migrations share
-- one history table.
CREATE TABLE IF NOT EXISTS generated_papers (
  id               TEXT PRIMARY KEY,

  syllabus_code    TEXT NOT NULL,
  title            TEXT NOT NULL,
  total_marks      INTEGER NOT NULL,
  question_count   INTEGER NOT NULL,

  -- Which model wrote it. The first question asked of a paper months
  -- later, and unanswerable if it is not stored beside the paper.
  generator_model  TEXT NOT NULL,

  -- The whole GeneratedPaper.
  paper            JSONB NOT NULL,

  -- What validation said at the time it was generated. Stored rather
  -- than recomputed, because the validator will change and the
  -- question "did this pass when we shipped it" has one answer.
  validation       JSONB NOT NULL,

  -- Highest trigram similarity to any retrieved source, and any
  -- findings above the threshold.
  originality      JSONB NOT NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generated_papers_syllabus_idx
  ON generated_papers (syllabus_code, created_at DESC);
