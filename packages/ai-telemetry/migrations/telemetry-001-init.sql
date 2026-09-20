-- Every call to a model, recorded.
--
-- Written because the free tier's rate limit, not model quality, has
-- been the binding constraint on this system from the first real run:
-- a 483-chunk corpus takes 284 seconds to embed and almost all of it
-- is waiting. None of that is visible without measuring it, and
-- "generation is slow" and "we are rate limited" call for opposite
-- responses.
CREATE TABLE IF NOT EXISTS model_calls (
  id            BIGSERIAL PRIMARY KEY,

  -- "models/gemini-3.5-flash:generateContent"
  path          TEXT NOT NULL,

  -- What the call was for, from the caller: 'embed', 'generate',
  -- 'diagram'. The path says which endpoint; this says why.
  operation     TEXT NOT NULL,

  outcome       TEXT NOT NULL
    CHECK (outcome IN ('ok', 'quota', 'overload', 'transport', 'error')),

  duration_ms   INTEGER NOT NULL,

  -- Of duration_ms, how much was spent waiting out a rate limit.
  waited_ms     INTEGER NOT NULL,

  attempts      INTEGER NOT NULL,

  -- Null, not zero, when the endpoint reports no usage.
  input_tokens  INTEGER,
  output_tokens INTEGER,

  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS model_calls_occurred_idx
  ON model_calls (occurred_at DESC);
CREATE INDEX IF NOT EXISTS model_calls_operation_idx
  ON model_calls (operation, occurred_at DESC);
