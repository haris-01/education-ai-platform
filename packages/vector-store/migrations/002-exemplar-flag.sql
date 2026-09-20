-- Not every stored chunk is fit to be imitated.
--
-- Phase 3 deferred multiple-choice options that are laid out around a
-- diagram rather than as lines, and that gap arrives here as chunks
-- holding a stem and none of the answers that give it meaning — 11 of 80
-- multiple-choice questions in the June 2024 session. They are real
-- content and must stay searchable, but a generator shown one as a model
-- would learn to write questions with no answers.
--
-- Defaults to TRUE so existing rows keep their current behaviour; the
-- pipeline recomputes the flag on its next run.
ALTER TABLE embedding_chunks
  ADD COLUMN IF NOT EXISTS is_exemplar BOOLEAN NOT NULL DEFAULT TRUE;

-- Retrieval for generation always filters on this, so it is worth an
-- index even though the column is low-cardinality: the selective side is
-- the one queries ask for.
CREATE INDEX IF NOT EXISTS embedding_chunks_is_exemplar_idx
  ON embedding_chunks (is_exemplar)
  WHERE is_exemplar = FALSE;
