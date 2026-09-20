# Roadmap

## Mission

Build a production-grade AI education platform while learning every major
area of modern AI Engineering.

This is not a tutorial project.

By the end, the goal is to be able to design, build, deploy and operate AI
systems similar to those used by companies building document intelligence,
RAG systems, AI assistants and generative AI products.

**The platform is the learning vehicle.**

## End product

A complete SaaS platform.

### B2B — Schools

- Student management
- Teacher management
- Payroll
- Attendance
- Timetable
- AI exam generation
- AI marking
- Analytics
- Learning insights

### B2C — Parents & Students

- Practice papers
- AI Tutor
- Personalized learning
- Performance tracking
- Homework generation
- Revision plans

## Core AI product

Generate brand new exam papers — not copies, not modified papers.

Completely new papers that follow Cambridge, Edexcel, AQA, OCR, IB and other
boards, while preserving:

- Syllabus coverage
- Assessment objectives
- Difficulty distribution
- Paper structure
- Question styles
- Diagrams, graphs, tables
- Mark schemes

## Final pipeline

```
Board Websites
      │
      ▼
Document Collection
      │
      ▼
Document Intelligence
      │
      ▼
Question Extraction
      │
      ▼
Knowledge Builder
      │
      ▼
Embeddings
      │
      ▼
Vector Database
      │
      ▼
RAG
      │
      ▼
Exam Generator
      │
      ▼
Diagram Generator
      │
      ▼
PDF Generator
      │
      ▼
Platform
```

## Learning philosophy

Every module is learned in the same order. For every topic, answer:

1. Why does it exist?
2. What problem does it solve?
3. What happened before this technology?
4. Why was that approach insufficient?
5. How does the modern approach work?
6. What are the trade-offs?
7. Which libraries exist?
8. Which library are we choosing, and why?
9. How is it done in production?
10. How do we monitor and operate it?

The goal is to understand both theory and production engineering.

## Learning modules

### Phase 1 — Data Collection ✅

**Purpose:** Collect every resource from every examination board.

**Output:** Raw PDFs (syllabus, question papers, mark schemes, examiner
reports, specimen papers, grade thresholds, support documents).

**Learn:** Crawling, scraping, pipelines, storage, metadata.

### Phase 2 — Document Intelligence 🚧

**Purpose:** Turn PDFs into structured data.

**Output:** `ParsedDocument`.

**Learn:** PDF internals, text extraction, layout analysis, images, tables,
drawings, bounding boxes, OCR (later), Document AI.

Current focus: native PDFs first, scanned/hybrid later.

**Status:** native-PDF path complete — text, drawings, tables, and images
all extracted and validated against real Cambridge PDFs, plus column
slicing for multi-column layouts (added when Phase 4 needed it to read the
syllabus's two-column subject content). OCR / scanned and hybrid documents
deferred by design, not started. See
[teaching notes](learning-notes/phase-02-document-intelligence.md) for why
this phase matters and what it taught.

### Phase 3 — Question Extraction ✅

**Purpose:** Understand exam structure.

**Output:** `QuestionDocument`.

**Learn:** Layout analysis, pattern recognition, question numbering,
sub-parts, marks, diagram references, multi-page questions.

**Status:** core complete — question numbering, sub-parts, sub-sub-parts,
marks, multiple-choice options, and diagram/table references all
extracted and validated against all 12 real Cambridge 0625 question
papers, with 40 automated tests. Diagram-positioned MCQ options (options
rendered as scattered labels around a picture rather than sequential
text) deferred by design — needs spatial reasoning, not text parsing.
See [teaching notes](learning-notes/phase-03-question-extraction.md) for
why this phase matters and what it taught.

### Phase 4 — Knowledge Builder ✅

**Purpose:** Combine every resource into one rich knowledge object.

**Input:** Question papers, mark schemes, examiner reports, syllabus.

**Output:** `KnowledgeDocument` — topic, AO1/AO2/AO3, difficulty, marks,
common mistakes, examiner advice, learning objectives, required diagrams.

**Status:** complete — every field above is produced by an extractor and
validated against real Cambridge 0625 documents. Assessment objectives
come from the syllabus's own paper weightings and command-word glossary;
difficulty and common mistakes from examiner commentary, kept verbatim so
they stay quotable; learning objectives from the two-column subject
content, which needed a new layout capability (`slicePageColumn`) rather
than better text parsing.

Coverage is honest about its sources: theory papers classify at 92-100%,
practical papers at 100%, multiple-choice at 15-30% — for difficulty that
is the examiner report's own ceiling (it discusses only the notable
questions), and for assessment objectives it is a real method limit that
Phase 5 embeddings should close. Gaps are reported rather than guessed.
See [teaching notes](learning-notes/phase-04-knowledge-builder.md).

### Phase 5 — Embeddings ✅

**Purpose:** Convert knowledge into vectors.

**Output:** `EmbeddingDocument`.

**Learn:** Embeddings, chunking, semantic search, similarity, vector
databases.

**Status:** complete — three chunk types (question, learning objective,
examiner insight), a provider-agnostic `Embedder` contract with a Gemini
implementation over plain fetch, and a real Postgres + pgvector store
with HNSW indexing and SQL metadata filtering. Measured against the June
2024 Cambridge 0625 session with `gemini-embedding-001`: 483 chunks,
~52,000 tokens, 95% carrying a topic, and 15/15 recall@5 on topic across
fifteen golden queries written before any retrieval was run. Phase 5 also
forced an additive fix upstream — `KnowledgeQuestion` was carrying only
the question stem, dropping every sub-part and multiple-choice option,
and `KnowledgeDocument` carried no paper code.

Both questions Phase 4 handed here are answered. Per-question learning
objectives work: 20 of 20 sampled questions retrieve a syllabus objective
from their own topic, so that is a solved retrieval problem awaiting a
field to store it in. The multiple-choice assessment-objective gap is
**not** closed, and is now measured rather than assumed — assigning an
objective by nearest syllabus description predicted AO1 for 19 of 19
labelled theory questions, scoring the base rate by being a constant.
Semantic similarity measures what a text is about; the AO1/AO2
distinction is cognitive demand, so it is the wrong instrument rather
than a weak one. That gap moves to Phase 7, as a model asked to judge the
question. Multimodal embedding of diagram-dependent questions is Phase 8;
hybrid search and reranking are Phase 6. See
[teaching notes](learning-notes/phase-05-embeddings.md).

### Phase 6 — Retrieval (RAG) ✅

**Purpose:** Retrieve only the knowledge needed.

**Learn:** RAG, hybrid search, metadata filtering, ranking, prompt
construction, context engineering.

**Status:** complete — lexical search over a generated `tsvector`
column beside the vector index, reciprocal rank fusion over the two,
and `retrieveForGeneration`, which assembles per-topic context with no
model call in the path at all: exemplars are found from the stored
vectors of the syllabus objectives themselves, so there is no query
text to embed. Coverage is per topic by construction, because a single
ranked search returns whatever the corpus has most of — which is how a
paper ends up with four questions on forces and none on the Sun.
Shortfalls are reported rather than silently returning a short list.

Fusion is on rank, not score: cosine distance and `ts_rank` are
different quantities on unrelated scales, and normalising them is a
guess about the corpus. Measured on the live store: six topics, eight
objectives and five unique exemplars each, in 47ms. Reranking beyond
RRF is deferred.

### Phase 7 — Exam Generation ✅

**Purpose:** Generate entirely new exam papers.

**Learn:** Prompt engineering, structured outputs, difficulty balancing,
assessment objectives, coverage algorithms, hallucination prevention.

**Status:** complete — per-topic generation against a response schema,
strict parsing of the result, and a validator that separates what no
real paper could be (marks that do not add up, a multiple-choice
question with no correct answer) from targets missed by a few points,
which real boards miss too.

The roadmap's "not copies, not modified papers" is enforced rather than
asserted: every generated question is compared against every retrieved
source by word-trigram similarity. The threshold is measured, not
guessed — across all 5,671 pairs of real, distinct Cambridge questions,
median similarity is 0.000 and p99 is 0.022, so 0.35 clears the floor
by a wide margin while still catching a question with its numbers
swapped at 0.41. Real papers generated at 80 marks exactly, valid, with
highest source similarity 0.049.

### Phase 8 — Diagram & Image Generation 🚧

**Purpose:** Generate exam-quality visuals (physics circuits, graphs,
geometry, biology diagrams, chemistry apparatus, maps, charts).

**Learn:** Vision models, SVG generation, image generation, vector graphics,
layout.

**Status:** SVG path built — figures are written as SVG by a text model,
validated against a strict allowlist, and embedded in the PDF as
vectors. Not an image model, though six are available on this account:
an exam figure is a technical drawing that must print at A4 with real
text labels, and an image model produces something that _looks_ like a
circuit. Failures are isolated per question and reported, so one
rejected figure does not lose the other ten.

The validator rejects rather than sanitises — a diagram quietly
stripped of half its content still reaches a candidate looking
complete. Not yet verified against the real model: the day's free-tier
quota was exhausted before a live figure could be drawn, so the SVG
path is proven only against the deterministic fake. Subject-specific
figure conventions (circuit symbols, ray-diagram arrowheads) are
untouched.

### Phase 9 — PDF Generation ✅

**Purpose:** Generate professional exam papers.

**Learn:** Typography, layout engines, pagination, headers, tables, diagram
placement, print-ready PDFs.

**Status:** complete — A4 papers with a cover, candidate boxes,
instructions, marks in the right margin, ruled answer space and
pagination that will not orphan a question's first line. The paper and
the mark scheme are separate documents, because one must not reveal the
answers and the other is nothing but answers; tests assert the
separation both ways. Rendering returns bytes, not a file path.

The tests are a round trip: render, then read the result back with this
project's own Phase 2 parser. A question needing a figure gets reserved
space and its brief printed in it until Phase 8 draws one.

### Phase 10 — Platform Engineering 🚧

**Purpose:** Turn AI into a production SaaS.

**Learn:**

- Backend: APIs, authentication, billing, multi-tenancy, background jobs
- Frontend: teacher portal, student portal, parent portal, AI chat, analytics
- Infrastructure: Docker, Kubernetes (later), CI/CD, cloud deployment,
  caching, queues, storage

**Status:** backend started 🚧 — a Fastify API over the whole pipeline
(`POST /api/papers/generate`, paper and mark-scheme PDF downloads,
listing and fetch), papers persisted in Postgres, migrations run per
module at startup, and Docker Compose for local Postgres with pgvector.
Driven end to end over HTTP against the live corpus.

Not started: authentication, billing, multi-tenancy, background jobs,
and every frontend. No UI by design for now — the backend is being
proved first.

### Phase 11 — AI Operations (AI Ops) 🚧

**Purpose:** Run AI systems reliably in production.

**Learn:** Monitoring, logging, metrics, cost tracking, rate limiting,
evaluation, prompt versioning, model versioning, experimentation, feedback
loops, observability.

**Status:** cost and rate-limit tracking built, because that has been
this system's actual operational constraint from the first real run —
483 chunks take 284 seconds to embed and almost all of it is waiting.
Every model call records duration, how much of it was spent waiting,
attempts, outcome and tokens where the endpoint reports them;
`GET /api/telemetry/usage` aggregates per operation and derives the
share of wall clock lost to rate limits.

Not started: prompt and model versioning, evaluation harnesses beyond
the opt-in retrieval suite, experimentation, and feedback loops.

## Technology stack

**Language**

- Primary: TypeScript
- Secondary: Python (only when needed)

**AI**

- OpenAI
- Gemini
- Local models (later)

**Backend**

- Node.js
- Fastify/NestJS (as appropriate)
- PostgreSQL
- Redis
- Queues

**AI infrastructure**

- pgvector (initially)
- Vector database abstraction
- Object storage
- Background workers

## Engineering principles

- Functional programming over classes where practical.
- Build reusable pipelines.
- Separate data contracts from transformation logic.
- Prefer deterministic code before introducing AI.
- AI is used where reasoning or generation adds value, not where
  straightforward engineering is sufficient.
- Design modules to be replaceable without changing the rest of the system.
- Keep every stage observable, testable, and measurable.

## Final goal

At the end of this project, be able to confidently build, explain, deploy
and operate production AI systems — not just this education platform, but
any document-centric or knowledge-based AI application. The platform serves
as a complete portfolio demonstrating skills in Document AI, RAG, multimodal
AI, backend engineering, frontend development, infrastructure, and AI
operations.
