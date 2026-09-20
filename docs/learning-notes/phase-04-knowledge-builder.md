# Phase 4 — Knowledge Builder: Teaching Notes

Status: complete. Every field the roadmap asks `KnowledgeDocument` to
carry is now produced by an extractor. Coverage varies by paper type and
by what the source documents actually say — see
[What The Numbers Mean](#what-the-numbers-mean).

## Why Phase 4 Matters

Phase 3 gave us a `QuestionDocument` — a question paper understood as
structure. Numbering, sub-parts, marks, options, diagram references. That
is one document, read in isolation.

But a question paper alone can't teach anything. It doesn't say what the
right answer is, what topic the question belongs to, what skill it tests,
how hard it turned out to be, or what candidates got wrong. Every one of
those facts lives in a _different_ document that the board publishes
separately.

```
Question paper  ─┐
Mark scheme     ─┤
Syllabus        ─┼─→  KnowledgeDocument
Examiner report ─┘
```

Phase 4 is where those documents stop being four separate files and
become one object per question. This is the point of the whole pipeline
so far: from here on, nothing downstream needs to know that a mark scheme
is a PDF.

It matters more than it looks, because **everything after this depends on
it**. Phase 5 embeds these objects. Phase 6 retrieves them. Phase 7
generates new papers from them — and a generated paper can only preserve
a board's difficulty distribution and assessment-objective weighting if
the source questions carry difficulty and assessment objectives in the
first place. A gap here is a gap in the final product.

## What We Built

Eight packages, each one concern, joined by a builder:

| Package                        | Answers                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `syllabus-extraction`          | What topics, sub-topics, learning objectives, assessment objectives and command words exist? |
| `mark-scheme-extraction`       | What is the correct answer / what earns each mark?                                           |
| `examiner-report-extraction`   | What did the examiner say, and what did candidates get wrong?                                |
| `topic-mapping`                | Which topic is this question about?                                                          |
| `assessment-objective-mapping` | Which skill (AO1/AO2/AO3) does it test?                                                      |
| `difficulty-estimation`        | How hard did it actually prove?                                                              |
| `knowledge-builder`            | All of the above, per question, as one object                                                |

Plus one Phase 2 addition that Phase 4 forced: `slicePageColumn`, which
narrows a page to a single column so lines can be reconstructed without
the two columns of a table bleeding into each other.

## What We Learned

### 1. Find the fact the document states before inferring one

The strongest signal is almost always printed somewhere, and the
temptation is to infer it instead.

Assessment objectives are the clearest case. The obvious approach is to
read the question text and guess whether it tests recall or
problem-solving. But the syllabus contains a table stating that papers 5
and 6 are **100% AO3** and papers 1–4 are **0% AO3**. That is not a
heuristic; it is the board telling you the answer. So the mapper reads
the paper number off the document (Cambridge prints `0625/41` on every
page) and settles practical papers outright — no text analysis at all,
and no way for a misleading command word to override it.

The same instinct applies to the command words themselves. Rather than
hardcoding a list of verbs, the extractor reads the syllabus's own
published glossary, and the only curated part is the mapping from each
word's stated meaning to each AO's stated definition. Every entry in that
table carries the quote that justifies it.

**The lesson:** before writing a classifier, read the source documents
properly and find out what they already assert.

### 2. Verbatim beats generated, when a human has to trust it

Common mistakes and difficulty evidence are both pulled out as **whole
sentences, unchanged**, and the corpus tests assert that every extracted
string still appears in the document it came from.

That constraint was deliberate. A teacher looking at "candidates often
confused condensation with evaporation" needs to be able to check it
against the report. A paraphrase — however accurate on average — cannot
be checked, and one wrong paraphrase poisons trust in all of them.

This is worth holding onto as we move into the AI phases, where
generating a summary becomes trivially easy. Easy is not the same as
useful.

### 3. An honest gap is a feature

Every extractor in this phase reports "I don't know" rather than
guessing:

- A question with no usable signal gets **no** assessment objective — it
  is not defaulted to AO1, even though AO1 is the most common.
- A question the examiner report never mentions gets **no** difficulty
  band — not "moderate", which would be indistinguishable from a real
  middling result.
- Paper codes that disagree across pages yield **undefined**, not
  whichever appeared first.
- The command word "Sketch" is deliberately unmapped: recalling a field
  pattern and plotting supplied readings are different objectives, and
  the word alone cannot separate them.

The reasoning is the same every time: downstream stages will treat these
fields as ground truth. A gap is visible and can be filled later. A
confident wrong answer propagates silently into a generated exam paper.

### 4. The real data is the specification

Almost every bug in this phase was found by running against real PDFs,
not by thinking harder. A representative sample:

- **Specimen papers print `0625/05`, not `0625/5`.** The leading zero is
  padding, so the second digit is the paper number, not a variant. Read
  the obvious way, every specimen paper came out as "paper 0".
- **The syllabus page footer starts with the page number** — "10
  www.cambridgeinternational.org/igcse Back to contents page" — which is
  indistinguishable from a numbered learning objective. Taking the column
  margin as the _most common_ position rather than the leftmost fixed it.
- **"Fig." ends a sentence, grammatically.** Splitting examiner
  commentary on full stops truncated a real mistake to "... measured the
  distance JK on Fig."
- **"Most stronger candidates chose the correct option" means the
  question was hard.** It is a claim about the strong cohort only. Read
  that "most" as a large share and the difficulty inverts.
- **The subject content is three levels deep, not two.** Sub-topic 1.5
  contains sections 1.5.1–1.5.3, and objective numbering restarts at each
  one.

None of these were guessable from the outside. The corpus tests exist
precisely to keep them fixed.

### 5. Layout problems need layout solutions

The learning-objective extractor was blocked for a real reason, and the
reason was not text parsing.

The syllabus's subject content is a two-column table — Core on the left,
Supplement on the right. Line reconstruction joins everything at the same
vertical position, which is correct for a normal page and catastrophic
here: a Core objective and an entirely unrelated Supplement objective get
glued into one line.

> "3 Recall and use the equation 9 Define acceleration as change in
> velocity per unit"

No amount of cleverer regex fixes that, because the damage happens before
the text is read. The fix was to add a **layout** capability —
`slicePageColumn` — and reconstruct lines within each column separately.

This is why the roadmap lists "layout analysis" under Phase 2. Phase 4
was the first thing to actually need it.

### 6. Name the signal, not just the answer

Every assignment in this phase carries its evidence: which command word
matched and where, which sentence produced a difficulty band, whether an
objective came from the paper rule or the question text.

That turned out to matter more than expected. When the multiple-choice
papers came back at 0% classified, the evidence made it obvious in
seconds that no command words were matching at all — because MCQ stems
ask "Which row ...?" rather than issuing a command. Without the evidence
trail that would have been a much longer debugging session.

It also makes the output auditable by a human who does not trust it yet,
which is the position every user of this platform starts from.

## What The Numbers Mean

Measured across all 12 real Cambridge 0625 papers and the June 2024
examiner report:

|                      | Theory (3x, 4x) | Practical (5x, 6x) | Multiple choice (1x, 2x) |
| -------------------- | --------------- | ------------------ | ------------------------ |
| Assessment objective | 92–100%         | 100%               | 15–28%                   |
| Difficulty           | 91–100%         | 75%                | 23–30%                   |

The multiple-choice numbers look poor and are worth understanding,
because **they are two different limits**:

- **Difficulty** is at the source's ceiling. The examiner report only
  discusses 12 of the 40 questions on 0625/11 — it comments on the
  notable ones, not all of them. All 12 are banded. There is nothing left
  to extract.
- **Assessment objectives** are at a genuine method limit. An MCQ with
  four numeric options is clearly AO2 ("solve problems... of a
  quantitative nature"). An MCQ with four descriptive options might be
  AO1 or AO2, and telling them apart needs to understand the physics, not
  the text. That is Phase 5/6 work, and the gap is left open rather than
  filled with a guess.

Knowing which kind of limit you are looking at decides whether more
effort would help. Here, more regex would not.

## Known Limitations (Deferred, Not Blocking)

- **Per-question learning objectives.** The syllabus's 324 objectives are
  extracted and carried on the document, but not mapped to individual
  questions. Keyword matching is only good enough at the topic level;
  matching a question to the specific objective it tests needs semantic
  similarity — exactly what Phase 5 embeddings provide.
- **AO1 vs AO2 on descriptive multiple-choice questions.** See above.
- **Difficulty without an examiner report.** Papers with no published
  report get no difficulty at all. Marks were considered as a fallback
  and rejected: a four-mark question is _longer_ than a one-mark
  question, not necessarily harder, and mixing the two would bury the
  real signal. Grade thresholds are a better future source.
- **One subject, one board.** Everything is validated against Cambridge
  IGCSE Physics 0625. The command-word glossary is shared across
  Cambridge sciences so should carry over; other boards will need their
  own tables.

## Production Principle

> Prefer the fact the document states. Where you must infer, infer
> deterministically, record the evidence, and report a gap rather than a
> guess.

Every module in this phase is replaceable — an LLM classifier could
replace the AO mapper tomorrow — but the contract it must satisfy is now
defined by something better than an opinion: 290 tests, of which the ones
that matter run against real exam papers.

## Concrete Implementation Reference

| Concern                          | Where                                                                   |
| -------------------------------- | ----------------------------------------------------------------------- |
| Paper identity from printed code | `question-extraction/pipeline/find-paper-identity.ts`                   |
| Command-word glossary            | `syllabus-extraction/pipeline/build-syllabus-overview.ts`               |
| Learning objectives (two-column) | `syllabus-extraction/pipeline/extract-sub-topics.ts`                    |
| Column slicing                   | `document-ai/pipeline/slice-page-column.ts`                             |
| Command word → AO table          | `assessment-objective-mapping/pipeline/command-word-objectives.ts`      |
| AO assignment                    | `assessment-objective-mapping/pipeline/assign-assessment-objectives.ts` |
| Common mistakes                  | `examiner-report-extraction/pipeline/extract-common-mistakes.ts`        |
| Difficulty                       | `difficulty-estimation/pipeline/estimate-difficulty.ts`                 |
| The join                         | `knowledge-builder/pipeline/build-knowledge-document.ts`                |
| Disk → KnowledgeDocument         | `knowledge-builder/pipeline/assemble-knowledge-document.ts`             |
