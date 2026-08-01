# Phase 3 — Question Extraction: Teaching Notes

Status: core complete. Diagram-positioned MCQ options deferred by design
— see [Known Limitations](#known-limitations-deferred-not-blocking).

## Why Phase 3 Matters

Phase 2 turned a PDF into a `ParsedDocument` — positioned text, drawings,
tables, images. That's geometry, not understanding. `ParsedDocument` has
no concept of "question 4" or "this is worth 3 marks" — just text runs
with coordinates.

```
ParsedDocument
  ↓
QuestionDocument
  ↓
Knowledge Builder
```

Phase 3 is where the platform starts understanding exam *structure*:
question numbering, sub-parts, mark allocation, multiple-choice options,
and which diagrams belong to which question. Everything from Phase 4
onward (Knowledge Builder, Embeddings, RAG, Exam Generation) consumes
`QuestionDocument`, never raw text runs.

## What We Built

```
ParsedDocument
  ↓ reconstructLines      — flat text runs → reading-order lines
  ↓ classifyLines         — line → role (question/sub-part/marks/...)
  ↓ buildAssemblyEvents   — merges in images/drawings/tables, sorted by position
  ↓ assembleQuestions     — state machine → nested Question tree
  ↓
QuestionDocument
```

Each stage is a pure function with a single job, tested independently —
the same "modular architecture" principle from Phase 2, applied to a
completely different kind of problem (parsing structure, not geometry).

Validated against all 12 real question papers in the Phase 1 dataset —
both multiple-choice and structured-theory formats, across specimen
papers and real past papers. Every question numbers sequentially, every
declared total matches the sum of its parts, every confirmed MCQ option
list is a clean 4-way run. Backed by 40 automated tests (Vitest): fast
synthetic-fixture tests for the tricky logic, plus a corpus test that
runs the real PDFs and asserts those same invariants.

## What We Learned

- **State machines for parsing.** A flat list of classified lines becomes
  a nested tree (question → part → sub-part) by walking it once with a
  small amount of "what's currently open" state — no backtracking, no
  lookahead, just a `reduce` over events.
- **Ambiguity can't always be resolved locally.** `"(i)"` looks like a
  valid single-letter sub-part *and* a roman numeral — resolved by
  knowing Cambridge conventions (sub-parts never reach `i`/`v`/`x`).
  `"A load is fixed to trolley P."` is *textually identical* to a real
  MCQ option — resolvable only by requiring the full A→D sequence to
  actually complete before committing to that interpretation. Some
  ambiguity needs sequence/context, not a better regex.
- **A statistic can be wrong in a way that still mostly works.** Using
  the *most common* line-start position as "the margin" passed every
  test on the first two documents tried, then silently misread numbered
  answer blanks as new questions on the fifth. It wasn't almost right —
  it was measuring the wrong thing (the dominant body-text indent, not
  the structural margin) and got lucky twice.
- **Recoverable state beats speculative commitment.** Buffering candidate
  MCQ options and only committing them once the sequence completes (or
  recovering the text if it doesn't) avoids a whole class of
  false-positive bugs that a "decide immediately" design can't avoid.
- **Real data finds bugs code review can't.** Every non-trivial bug this
  phase — the `i`/`v`/`x` collision, the margin miscalculation, the MCQ
  false positive — only showed up when running against actual Cambridge
  papers, not from reasoning about the code in isolation. The corpus
  went from 2 documents to 12 specifically because 2 wasn't enough to
  catch what turned out to be real, production-relevant failures.
- **Tests should have layers.** Fast synthetic tests pin down specific
  logic paths in milliseconds; a slower, real-data corpus test catches
  what synthetic fixtures can't think to construct. Neither replaces the
  other.

## Known Limitations (Deferred, Not Blocking)

- **Diagram-positioned MCQ options.** Some multiple-choice questions
  place options as labels scattered around a diagram (e.g. `"A"`/`"D"`
  at the top/right of a picture, `"B"`/`"C"` at the bottom) rather than
  as sequential lines. This is a real gap — confirmed on ~9 of 40
  questions on a typical MCQ paper — but solving it needs spatial
  reasoning over image/drawing bounding boxes, not text-line sequencing.
  Deferred until diagram understanding is actually needed elsewhere.
- **Single board, single subject.** Everything is validated against
  Cambridge IGCSE Physics (0625) only. The number/sub-part/marks patterns
  are Cambridge-specific conventions, not verified against Edexcel, AQA,
  OCR, or IB formats.
- **Mark schemes aren't parsed.** `buildQuestionDocument` only
  understands question papers. Mark schemes, examiner reports, and
  grade-threshold documents need their own extraction logic — likely
  Phase 4's problem, since that's where multiple resources get combined.
- **No answer-key extraction.** For MCQ questions, the option *text* is
  captured but not which option is correct — that lives in the mark
  scheme, not the question paper.
- **Front-matter is silently dropped.** Instructions, cover-page text,
  and anything before question 1 isn't captured anywhere — reasonable
  for now since it's not exam content, but worth remembering if that
  changes.

## Production Principle

The methodology mattered more than any single fix: build the smallest
next piece, validate it against real documents immediately, and treat
every discrepancy as a real bug until proven otherwise — not a "probably
fine, real-world data is messy" shrug. Three of this phase's bugs would
have shipped silently wrong if validation had stopped at "looks right on
one document."

## Concrete Implementation Reference

For the actual pipeline — line reconstruction, classification patterns,
the assembly state machine, and the test suite — see
`packages/question-extraction/src/`.
