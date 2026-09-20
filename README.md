# education-ai-platform

Forging structured, exam-ready content with AI.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the project mission, phased learning roadmap, and engineering principles.

## Getting started

```bash
pnpm install
pnpm test
```

Every test runs without credentials. Suites that need something absent —
the `datasets/` corpus, a database, a model API key — skip with a notice
rather than failing.

## Running with a database

Phase 5 onwards stores vectors in Postgres with pgvector.

```bash
cp .env.example .env
pnpm db:up        # starts Postgres on 127.0.0.1:5433
pnpm db:migrate
```

`pnpm db:down` stops it. Port 5433 rather than the default 5432, so this
project can run alongside others on the same machine.

## Running the API

```bash
pnpm db:up
pnpm --filter @education-ai/api start     # http://127.0.0.1:3333
```

It runs its migrations at startup. Without a `GEMINI_API_KEY` it uses
the deterministic fake generator, so every endpoint works with no model
and no cost; set `USE_FAKE_GENERATOR=1` to force that even with a key.

```bash
curl -X POST http://127.0.0.1:3333/api/papers/generate \
  -H 'content-type: application/json' \
  -d '{"syllabusCode":"0625","title":"Physics","totalMarks":40,
       "topics":[{"topicNumber":1,"questionCount":2}]}'

curl -O -J http://127.0.0.1:3333/api/papers/<id>/paper.pdf
curl -O -J http://127.0.0.1:3333/api/papers/<id>/mark-scheme.pdf
```

Generating needs an indexed corpus; run `pnpm probe:embeddings` first,
or the API answers `409 CORPUS_EMPTY` rather than inventing a paper.

## Running with a model

Embedding with a real model needs a key from
[Google AI Studio](https://aistudio.google.com/apikey); the free tier
covers this corpus. Put it in `.env` as `GEMINI_API_KEY`, then:

```bash
pnpm probe:embeddings     # chunk the corpus and sync it into pgvector
pnpm probe:retrieval      # retrieve per topic — no model calls at all
pnpm probe:generate       # retrieve, generate, validate, write PDFs
pnpm test:retrieval       # opt-in: measures retrieval quality, needs a key
```

`probe:generate` uses the fake generator unless `GENERATE_WITH_MODEL=1`
is set. Only `probe:embeddings` and `test:retrieval` need a key at all —
everything else runs on stored vectors.

Output lands in `output/papers/`.

## Layout

| Path           | What                                                 |
| -------------- | ---------------------------------------------------- |
| `packages/`    | One concern each, from PDF parsing to vector storage |
| `apps/worker/` | Collectors that populate `datasets/`                 |
| `playground/`  | Probe scripts for inspecting real documents by hand  |
| `tools/`       | Repository tooling, including `pnpm audit:security`  |
| `docs/`        | Roadmap, coding standards, per-phase teaching notes  |
