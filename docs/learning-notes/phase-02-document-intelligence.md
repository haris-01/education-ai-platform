# Phase 2 — Document Intelligence: Teaching Notes

Status: complete for native PDFs. OCR / scanned-hybrid deferred by design —
see [ROADMAP.md](../ROADMAP.md).

## Why Phase 2 Matters for AI

Phase 2 is not about PDFs.

It is about creating a canonical document representation.

Everything after this point should operate on structured documents, never
raw PDFs.

```
PDF
  ↓
ParsedDocument
  ↓
Question Extraction
  ↓
Knowledge Builder
  ↓
Embeddings
  ↓
RAG
  ↓
Exam Generation
```

This means every downstream module is independent of the original file
format.

Whether the source is:

- PDF
- Word
- HTML
- OCR
- Images

they all produce the same `ParsedDocument`.

That abstraction is one of the biggest architectural decisions in the
entire platform.

## What We Learned

Phase 2 wasn't about learning pdfjs.

It taught several important engineering concepts:

- Document AI
- Coordinate systems
- Graphics pipelines
- Affine transformations (CTMs)
- Spatial clustering
- Geometric reasoning
- Information extraction
- Pipeline design
- Abstraction
- Defensive engineering
- Observability
- Modular architecture

Those concepts transfer to many other AI systems beyond education.

## Concepts in Detail

### 1. Document AI

What is it?

Document AI is the field of making computers understand documents the way
humans do.

Humans instantly recognize: headings, paragraphs, questions, tables,
diagrams, signatures, footnotes.

A computer sees: draw text here, draw a line, draw a rectangle, draw an
image.

Document AI reconstructs the semantic structure.

**Before:** people manually entered data.

**Today:** systems automatically extract invoices, passports, contracts,
receipts, bank statements, exams.

Google Document AI, Azure Document Intelligence, Amazon Textract and others
all solve variations of this problem.

Our parser is becoming a miniature Document AI system.

### 2. Coordinate Systems

Everything drawn has a position.

Instead of saying "Question 5 is below Question 4," the computer says:

```
x = 82
y = 418
width = 390
height = 56
```

Coordinates allow us to answer questions like:

- Is this text inside the table?
- Which diagram belongs to this question?
- Which paragraph comes first?

Without coordinates, layout understanding is impossible.

### 3. Graphics Pipelines

A graphics pipeline is the sequence that turns instructions into pixels.

For PDFs:

```
PDF Operators
  ↓
Graphics State
  ↓
Shapes
  ↓
Images
  ↓
Text
  ↓
Rendered Page
```

Games, browsers, and PDFs all use graphics pipelines.

Understanding one helps you understand the others.

### 4. Affine Transformations (CTMs)

One of the most important graphics concepts.

Instead of storing every object's final position, graphics systems
transform objects.

Imagine drawing a square. Instead of changing every point — `(0,0)`,
`(1,0)`, `(1,1)`, `(0,1)` — you say "move everything right 200 pixels."
That's a translation.

Other transforms include: translate, rotate, scale, skew.

These combine into one matrix. The Current Transformation Matrix (CTM)
keeps track of them.

Every serious graphics engine uses this idea.

### 5. Spatial Clustering

Suppose a circuit diagram contains 80 individual lines.

Humans see: one diagram.

The computer sees: 80 boxes.

Spatial clustering groups nearby things together — many small boxes become
one region.

This appears everywhere: OCR, maps, computer vision, self-driving cars,
satellite imagery.

### 6. Geometric Reasoning

Instead of understanding language, we're understanding geometry.

Examples: does this box overlap another? Which object is closest? Is this
inside the table? Is this line horizontal?

That's geometric reasoning.

Many AI systems mix language reasoning with geometric reasoning.

### 7. Information Extraction

Raw data becomes structured knowledge.

Example — "Question 4: State Newton's Second Law." becomes:

```json
{
  "questionNumber": 4,
  "topic": "Forces",
  "marks": 2
}
```

Information extraction powers search, legal AI, medical AI, finance, RAG.

### 8. Pipeline Design

Instead of writing one giant function (PDF → Everything), we build stages:

```
PDF
  ↓
Parser
  ↓
Question Extractor
  ↓
Knowledge Builder
  ↓
Embeddings
```

Each stage has an input, an output, and a responsibility. That's a
pipeline.

Large AI systems are almost always pipelines.

### 9. Abstraction

Hide unnecessary complexity.

Instead of every module reading PDFs directly, they all consume
`ParsedDocument`. Now downstream modules don't care whether the source was
PDF, OCR, Word, or HTML.

That's abstraction. Good abstractions make systems easier to extend.

### 10. Defensive Engineering

Assume things will go wrong.

Instead of "download PDF," write: retry → timeout → log failure →
continue.

Instead of assuming the parser succeeds, check: missing page? skip.
corrupt image? log it, continue.

Production software survives failures.

### 11. Observability

Knowing what's happening inside your system.

Instead of "parser finished," log: 18 pages, 3211 text blocks, 8 images, 27
drawings, 6 tables, 312 ms.

Later you'll add metrics, tracing, dashboards, alerts.

Without observability, debugging AI systems becomes guesswork.

### 12. Modular Architecture

Build small independent pieces.

Instead of one `parser.ts` with 4,000 lines, build separate modules: CTM,
geometry, image extraction, drawing extraction, table detection, text
extraction, question extraction.

Each module has one job. Benefits: easier testing, easier debugging, easier
replacement, reusable code, parallel development.

This is especially important in AI, where you'll frequently replace one
component (for example, swapping one embedding model or parser for
another) without wanting to rewrite the entire system.

### Why These Concepts Matter Beyond This Project

These aren't "PDF concepts." They're core software and AI engineering
concepts:

| Concept                  | Used in                                     |
| ------------------------- | -------------------------------------------- |
| Document AI                | Search, legal tech, finance, healthcare      |
| Coordinate systems         | Graphics, GIS, robotics, AR/VR               |
| Graphics pipelines         | Browsers, games, rendering engines           |
| Affine transformations     | Computer vision, CAD, image editing          |
| Spatial clustering         | OCR, computer vision, autonomous driving     |
| Geometric reasoning        | Layout analysis, robotics, mapping           |
| Information extraction     | NLP, knowledge graphs, search engines        |
| Pipeline design             | Data engineering, ML, AI systems             |
| Abstraction                 | Every large software system                  |
| Defensive engineering       | Production systems, distributed systems      |
| Observability                | DevOps, MLOps, AI Ops                        |
| Modular architecture         | Scalable software and AI platforms          |

This is why starting with document processing instead of immediately
calling an LLM matters. These are principles that apply across almost
every production AI system, not just RAG.

## Industry Perspective

Modern AI systems don't send PDFs directly to an LLM.

They first transform documents into structured representations.

Companies building:

- search engines
- legal AI
- medical AI
- financial AI
- coding assistants

all have some form of a document understanding layer before retrieval or
generation.

Our `ParsedDocument` plays that role.

## Why This Makes RAG Better

Instead of embedding an entire page, we can embed:

- a question
- a paragraph
- a table
- a diagram
- a syllabus objective

Each chunk keeps its metadata:

- page number
- coordinates
- document type
- subject
- board
- paper
- assessment objective

That dramatically improves retrieval quality.

## Production Principle

Never let AI solve a problem deterministic code can solve reliably.

PDF parsing, coordinate transforms, clustering, and layout reconstruction
are engineering problems.

Question generation, semantic retrieval, tutoring, and exam creation are AI
problems.

Keeping that boundary clear makes the system cheaper, faster, more
reliable, and easier to maintain.

## Practice

Write one of these summaries at the end of every phase. It keeps
reinforcing why you're building each module and how it contributes to
becoming an AI engineer, rather than letting the project become "just
another coding exercise."

## Known Limitations (Deferred, Not Blocking)

`parseNativePdf()` produces a complete `ParsedDocument`, but the extraction
quality has known rough edges. None of these block Phase 3 — they're
recorded here so they aren't rediscovered from scratch later.

- **Whitespace runs.** pdfjs emits standalone `" "` items as their own text
  elements alongside real words (`"PHYSICS"`, `" "`, `"0625/04"`). Needs
  run-merging before text is genuinely usable as words/lines.
- **No reading order.** Pages currently expose a flat list of text elements,
  not a `Page → Line → Word` structure. This is the most important gap to
  close early in Phase 3 — question numbering and sub-part detection depend
  on knowing line order, not just having coordinates.
- **Hybrid classification is unrefined.** The scanned/hybrid heuristic
  (e.g. flagging mark schemes) hasn't been validated carefully. Left alone
  until OCR work actually starts.
- **Unresolved image objects.** Images referenced only inside nested Form
  XObjects sometimes never resolve via pdfjs's callback API (handled today
  with a timeout + skip, not a real fix). This is a pdfjs limitation, not
  worth more time now.
- **Drawings are undifferentiated.** Every vector drawing is classified as
  a generic `"drawing"` — no distinction between circuit, graph, geometric
  figure, chart, decorative box, or page border. Fine for now.
- **Tables expose geometry, not content.** `TableElement` gives row/column
  boundaries and a bounding box, not cell text. Cell-level extraction is
  deferred until something downstream actually needs table contents.

## Concrete Implementation Reference

For the actual engineering behind this phase — the CTM/affine-transform
math, spatial clustering, table-lattice detection, image decoding, and the
production bugs found by testing against real Cambridge PDFs — see
`packages/document-ai/src/pipeline/`.
