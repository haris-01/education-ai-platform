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
all extracted and validated against real Cambridge PDFs. OCR / scanned and
hybrid documents deferred by design, not started. See
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

### Phase 4 — Knowledge Builder

**Purpose:** Combine every resource into one rich knowledge object.

**Input:** Question papers, mark schemes, examiner reports, syllabus.

**Output:** `KnowledgeDocument` — topic, AO1/AO2/AO3, difficulty, marks,
common mistakes, examiner advice, learning objectives, required diagrams.

### Phase 5 — Embeddings

**Purpose:** Convert knowledge into vectors.

**Learn:** Embeddings, chunking, semantic search, similarity, vector
databases.

**Output:** `EmbeddingDocument`.

### Phase 6 — Retrieval (RAG)

**Purpose:** Retrieve only the knowledge needed.

**Learn:** RAG, hybrid search, metadata filtering, ranking, prompt
construction, context engineering.

### Phase 7 — Exam Generation

**Purpose:** Generate entirely new exam papers.

**Learn:** Prompt engineering, structured outputs, difficulty balancing,
assessment objectives, coverage algorithms, hallucination prevention.

### Phase 8 — Diagram & Image Generation

**Purpose:** Generate exam-quality visuals (physics circuits, graphs,
geometry, biology diagrams, chemistry apparatus, maps, charts).

**Learn:** Vision models, SVG generation, image generation, vector graphics,
layout.

### Phase 9 — PDF Generation

**Purpose:** Generate professional exam papers.

**Learn:** Typography, layout engines, pagination, headers, tables, diagram
placement, print-ready PDFs.

### Phase 10 — Platform Engineering

**Purpose:** Turn AI into a production SaaS.

**Learn:**

- Backend: APIs, authentication, billing, multi-tenancy, background jobs
- Frontend: teacher portal, student portal, parent portal, AI chat, analytics
- Infrastructure: Docker, Kubernetes (later), CI/CD, cloud deployment,
  caching, queues, storage

### Phase 11 — AI Operations (AI Ops)

**Purpose:** Run AI systems reliably in production.

**Learn:** Monitoring, logging, metrics, cost tracking, rate limiting,
evaluation, prompt versioning, model versioning, experimentation, feedback
loops, observability.

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
