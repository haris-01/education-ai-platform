-- Vector search alone cannot answer a lookup.
--
-- "0625/41 Q3" and "thallium-208" are not similarity problems: the first
-- names a row, the second is a token that either appears or does not.
-- Embeddings are lossy by construction — a rare symbol is the first
-- thing a 768-dimension projection discards — so a query built from one
-- retrieves things that are merely *about* the same topic. Phase 6 needs
-- both, which means the store needs a lexical index beside the vector
-- one.
--
-- A generated column rather than a trigger: it cannot drift from the
-- content it indexes, because Postgres recomputes it on every write and
-- there is no code path that can forget to.
ALTER TABLE embedding_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS embedding_chunks_content_tsv_idx
  ON embedding_chunks USING gin (content_tsv);
