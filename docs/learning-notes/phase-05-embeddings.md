# Phase 5 — Embeddings: Teaching Notes

Status: complete and measured, against a real model. Every chunk type is
produced, embedded with `gemini-embedding-001` and stored in a real
Postgres with pgvector, validated on the June 2024 Cambridge 0625
session. Retrieval measures 15/15 recall@5 on topic across the full
corpus. Both questions Phase 4 handed to this phase are now answered —
one yes, one no, and the no is the more useful of the two. See
[What The Numbers Mean](#what-the-numbers-mean).

## Why Phase 5 Matters

Phases 1 to 4 were deterministic text engineering. Crawl a site, parse a
PDF, find a question number, match a command word to an assessment
objective. Every step was a rule someone could read and check, and when
one was wrong there was a regex to fix.

Phase 5 is the first step that is none of those things. An embedding is a
list of 768 numbers that no one can read, produced by a model no one in
this project trained, and the only way to know whether it is any good is
to measure what it retrieves.

```
KnowledgeDocument
       │
       ▼
   Chunking          — what is one unit of knowledge?
       │
       ▼
   Embedder          — text in, vector out
       │
       ▼
   pgvector          — store, filter, rank
```

It matters because retrieval is the constraint on everything after it.
Phase 6 is retrieval. Phase 7 generates a new paper from what Phase 6
retrieved — and a generator can only imitate questions it was actually
shown. A paper generated from the wrong five questions is wrong in a way
no amount of prompt engineering fixes. The quality ceiling of the whole
product is set here, and it is set quietly: bad retrieval does not throw
an error, it just returns something plausible.

There is also a second reason, less obvious. Phase 4 closed with two
promises it explicitly handed to Phase 5 — that embeddings would close
the multiple-choice assessment-objective gap, and that mapping a question
to the specific learning objective it tests "needs semantic matching,
which is Phase 5/6 work". This phase is where those get settled. One of
them is now testable. Neither is yet answered.

## What We Built

Two packages and a database.

| Package        | Answers                                                      |
| -------------- | ------------------------------------------------------------ |
| `embeddings`   | What is one chunk, and how does text become a vector?        |
| `vector-store` | Where do vectors live, and how are they filtered and ranked? |

Three chunk types, because three different questions get asked of this
corpus:

| Chunk type          | One per                  | Answers                         |
| ------------------- | ------------------------ | ------------------------------- |
| `question`          | Question                 | How has this been asked before? |
| `learningObjective` | Syllabus objective       | What must be taught?            |
| `examinerInsight`   | Question with commentary | What do candidates get wrong?   |

Plus one Phase 4 change that Phase 5 forced: `KnowledgeQuestion` now
carries `parts` and `options`, and `KnowledgeDocumentMetadata` carries
the paper code. See [The stem is not the question](#1-the-stem-is-not-the-question).

## Choosing An Embedding Model

The roadmap asks, for every technology, which libraries exist and which
one we chose. Phase 2 was the last phase where that question had a real
answer; this is the next.

**What exists.** OpenAI's `text-embedding-3` family is the default
choice and priced accordingly. Cohere's `embed-v4` is strong on retrieval
and supports int8 and binary compression natively. Google's
`gemini-embedding-001` is competitive on the public retrieval benchmarks
and is Matryoshka-trained, so its output can be truncated to a smaller
width without retraining. Open-weight models — the `bge` and `e5`
families — run locally through `fastembed` or `transformers.js` and cost
nothing per call.

**What we chose, and why.** `gemini-embedding-001`, through Google AI
Studio's free tier, behind an `Embedder` interface.

- The free tier is genuinely free and needs no card. This corpus is 483
  chunks and roughly 52,000 tokens; the whole thing embeds in one run.
- Matryoshka truncation matters more than it sounds, because pgvector's
  HNSW index refuses anything wider than 2000 dimensions. The model's
  full 3072 would store and then never index. 768 is a coherent smaller
  embedding, not a damaged large one.
- It takes a task type, so documents and queries are embedded
  differently. Phase 6 depends on that.

**What we chose against.** Cohere's free tier is a _trial_ key: monthly
call caps, and its terms forbid production use. It is a demo, not a
runway. A local model was the serious alternative — no key, no network,
no cost — but every local runtime in this ecosystem ships a native
binary with an install script, and this repository's install-script
allowlist is deliberately one entry long. That is a real trade: we gave
up offline operation to avoid adding dependency surface.

**How it is wired.** No SDK. The request is one JSON POST, made with the
`fetchWithRetry` already in `shared`. Phase 5 adds exactly one runtime
dependency to the whole monorepo — `pg` — and it declares no install
scripts.

## What We Learned

### 1. The stem is not the question

`KnowledgeDocument` looked finished at the end of Phase 4. Every field
the roadmap asked for was populated and tested. It survived contact with
the first consumer that needed to read a question as prose for about ten
minutes.

`KnowledgeQuestion.text` held the stem — the words before "(a)". The
sub-parts, where most of a theory question lives, had been dropped at the
join, along with every multiple-choice option. Embedding that would have
embedded a fragment of each theory question, and for an MCQ, the question
without any of the four answers a candidate chooses between.

Measured on 0625/41: the sub-part text is longer than every stem on the
paper put together. The paper code was missing too — `0625/41` is printed
on the document and read by Phase 3, then discarded at the join, leaving
no way for a `WHERE` clause to name a paper.

**The lesson:** a data contract is not finished when its fields are
populated. It is finished when something downstream has actually consumed
it. Phase 4 had 290 passing tests and this gap; the tests asserted that
each field was correct, and nothing asserted that the set was sufficient.

### 2. Chunk on the structure you already have

The standard first answer to chunking is a fixed token window with some
overlap — 512 tokens, 50 overlapping. It is the right answer when all you
have is a wall of text.

It is the wrong answer here, and it took a moment to see why: Phase 3
spent its entire existence working out where one question ends and the
next begins. A token window would cut question 4 in half and glue its
back end to question 5, discarding that work and producing chunks that
belong to no question in particular.

A question is also the unit that gets _asked for_. Phase 7 retrieves
exemplar questions to imitate. Nobody wants 512 tokens of paper.

**The lesson:** chunk on the boundaries your data already has. Fixed
windows are what you use when you could not find any.

### 3. A chunk has to say where it came from

"Calculate the acceleration of the trolley." is a real sub-part from
0625/41, and on its own it is very nearly contentless. It could belong to
a third of the syllabus. Embedded bare, its vector lands in a vague
region shared by everything that mentions acceleration, and a
topic-scoped query has no way to find it.

Every chunk is therefore prefixed with one line naming where it sits:

```
Paper 0625/41 — Topic 1: Motion, forces and energy — Question 3 — 6 marks

Fig. 3.1 shows a trolley on a ramp.
...
```

It costs a handful of tokens per chunk. It is the cheapest available
improvement to retrieval, and the reason is not subtle: the header puts
words in the vector that a query is likely to share.

The same reasoning sets a rule about what _not_ to include. The header
omits anything the document does not know — an unclassified question gets
no topic line rather than one reading "Topic undefined", because that
string is text, and text gets embedded, and now every unclassified
question is slightly similar to every other one for no reason.

### 4. Scope a chunk to what owns it, not to what you read it beside

The syllabus's 324 learning objectives arrive attached to a
`KnowledgeDocument`, which is built per paper. The obvious code keys them
by that document's id.

Twelve papers share one syllabus. That code embeds the same 324
objectives twelve times, pays for it twelve times, and leaves twelve
near-identical copies in the store for every query to wade through and
every result set to be dominated by.

Learning objectives belong to the syllabus, so they take the syllabus's
id. The corpus test asserts the content hashes come out identical
whichever paper they were read alongside.

**The lesson:** in a pipeline that joins documents, ask what each fact
belongs to, not which object happened to be holding it when you got
there.

### 5. The failures that matter here are silent

Nothing in this phase throws when it goes wrong. Every mistake available
returns plausible results that are quietly worse:

- **Task type.** A query and the document that answers it are not the
  same kind of text, and a retrieval-trained model places them
  deliberately differently. Embed both as documents and everything still
  works — a bit worse, forever.
- **Normalisation.** Only the full-width 3072-dimension vectors come back
  as unit vectors. A truncated Matryoshka vector does not, and cosine
  distance over unnormalised vectors ranks partly by magnitude. Results
  still come back ordered. They are ordered slightly wrong.
- **Operator class.** An HNSW index built for cosine does not serve an L2
  query. Postgres does not complain; it silently stops using the index
  and sequentially scans. Correct answers, no index, and you find out
  when the corpus is large enough to hurt. Verified directly on the
  loaded store: with sequential scans disabled, the `<=>` query plans as
  `Index Scan using embedding_chunks_embedding_idx`, and the identical
  query written with `<->` falls back to a sort over a full scan. Same
  data, same index, one operator apart.

So both of the first two are in the `Embedder` contract rather than left
to call sites: `taskType` is a required argument, and every
implementation returns unit vectors. The third is a comment in the
migration next to the index, pointing at the `<=>` it has to agree with.

**The lesson:** when the failure mode is a silent quality loss rather
than an error, a convention is not enough. Put it in the type.

### 6. A deterministic fake is not a weak model

Most of this phase is tested with an embedder that hashes text into a
unit vector. It has no semantics at all.

That turns out to be exactly right for what it is used on. Chunking,
identity, upsert idempotency, vector-column round-tripping, filter
correctness, dimension validation — none of these are about meaning, and
all of them are about whether the same input reliably produces the same
output. 73 of Phase 5's 76 tests need no key, no network and no money,
and 12 of those need only a local container — which is what keeps the
suite runnable on a fresh clone.

It is also exactly wrong for retrieval quality, and will give a
confident, meaningless answer if asked. The line between the two is the
useful thing: **a fake is safe wherever the test does not depend on the
thing being faked.**

### 7. Metadata in columns is the reason to use a database

A file of vectors and a cosine loop is about thirty lines and would have
retrieved fine for 483 chunks. It is worth being clear about what the
database actually buys, because "we used pgvector" is not an answer.

It is this: Phase 6 does not ask for the nearest chunks. It asks for the
nearest _question_ chunks, on topic 3, worth four or more marks, that are
not from the paper being imitated. With metadata in real columns that is
one statement, and Postgres narrows and ranks together. With metadata in
a JSON blob — or in a file — it is fetch-everything-then-filter, and the
top-5 you filter down to was chosen before the filter was applied.

The integration test that matters most makes exactly this point: the
nearest chunk to the query is a learning objective, and the query asked
for questions, so the right answer is the _second_-nearest chunk.

### 8. The rate limit is a design constraint, not an error case

The embedder was written to batch 100 texts per call, on the reasonable
assumption that fewer round trips is better. The first real run failed on
the first batch, and the free tier's own 429 explained why:

```
quotaId:     EmbedContentRequestsPerMinutePerUserPerProjectPerModel
quotaMetric: embed_content_free_tier_requests
quotaValue:  100
```

**Each text in a batch counts as one request.** Batching buys round
trips, not quota. A batch of 100 spends the whole minute's budget in a
single call, so 483 chunks were never going through in one burst however
they were arranged. The corpus takes 284 seconds and almost all of it is
waiting — and that is the correct speed, not a problem to optimise.

Two smaller things fell out of this, both of which had been wrong:

- **The retry has to read the reply.** The first version used the
  `fetchWithRetry` already in `shared`, which throws on any non-2xx and
  discards the body. The body is exactly where this API puts the answer:
  a 429 carries a `RetryInfo` naming the delay it wants. Retrying a
  quota rejection on a fixed 500ms backoff just spends the attempts.
- **Two failures need two answers.** Removing that helper removed
  transport retries along with it, so an `ECONNRESET` four minutes into a
  paced run killed the whole run. A dropped connection wants a two-second
  retry; a quota rejection wants a minute. Collapsing them into one
  policy serves neither.

**The lesson:** with a metered API, the quota shape belongs in the
design, not in an error handler bolted on afterwards. And the provider
tells you what it is — in the response body that a generic HTTP helper
throws away.

## What The Numbers Mean

Measured on the real June 2024 Cambridge 0625 session, all six papers:

| Paper   | Questions | Question chunks | Insight chunks | Mean chars |
| ------- | --------- | --------------- | -------------- | ---------- |
| 0625/11 | 40        | 40              | 12             | 360        |
| 0625/21 | 40        | 40              | 11             | 366        |
| 0625/31 | 11        | 11              | 11             | 1672       |
| 0625/41 | 9         | 9               | 9              | 1962       |
| 0625/51 | 4         | 4               | 4              | 2861       |
| 0625/61 | 4         | 4               | 4              | 3029       |

Plus 324 learning objectives, for **483 chunks and roughly 52,000
tokens** in total. 95% of chunks carry a topic. Embedding all 483 with
`gemini-embedding-001` took **284 seconds**, almost all of it waiting on
the free tier's rate limit rather than computing anything.

Two things worth reading off that table:

- **324 is exactly the objective count Phase 4 reported.** That is the
  check that the syllabus survived the trip intact, not a coincidence.
- **The insight column is the source's ceiling, again.** Theory papers
  produce one insight chunk per question. The multiple-choice papers
  produce 12 of 40 and 11 of 40, because the examiner report discusses
  the notable questions only. This is the same limit Phase 4 recorded for
  difficulty, showing up in a different shape, and it is printed rather
  than padded out with empty chunks.

### Retrieval

Fifteen golden queries, written before any retrieval was run, each paired
with the 0625 topic it should land in:

| Corpus                        | recall@5 on topic |
| ----------------------------- | ----------------- |
| All six papers (483 chunks)   | **15/15**         |
| Papers 11 and 41 (373 chunks) | 14/15             |

The difference between the two rows is the honest part: the same queries
against a smaller corpus lose one. Recall is a property of the corpus as
much as of the model, and quoting a single number without saying what it
was measured over means very little.

The hits are right for the right reasons, which matters more than the
score. "half-life of a radioactive isotope" returns a strontium-90
nuclide-notation question at distance 0.306. "magnetic field around a
current-carrying wire" returns a solenoid question at 0.312. Neither
shares much vocabulary with its query.

### Phase 4's first promise: answered

Phase 4 left per-question learning objectives undone, saying the mapping
"needs semantic matching, which is Phase 5/6 work". Measured: **20 of 20**
sampled questions retrieve a syllabus objective from their own topic in
the top 3.

That is the claim, settled. Turning it into a stored per-question field
is a small piece of Phase 6 work with the hard part already done.

### Phase 4's second promise: answered, and the answer is no

The multiple-choice assessment-objective gap — 15-30% coverage, because
telling AO1 from AO2 on a descriptive option needs to understand the
physics — is **not closed by embeddings**, and will not be. Phase 4's
expectation was wrong. This is now measured rather than assumed.

There is no ground truth for multiple-choice questions; that absence _is_
the gap. So the experiment is indirect. Theory questions _are_ labelled,
by the syllabus's own command-word glossary, at 92-100%. Hold those
labels out, assign an objective by nearest syllabus AO description
instead, and see whether the two agree. Agreement where a label exists
would be evidence for the method where one does not.

Across 19 labelled theory questions on 0625/31 and 0625/41:

| Measure                                | Result      |
| -------------------------------------- | ----------- |
| Agreement with the command-word label  | 10/19 (53%) |
| Questions predicted AO1                | **19/19**   |
| Questions actually labelled AO1        | 10/19       |
| Mean cosine margin between AO1 and AO2 | 0.0216      |

Read the second row before the first. The method predicted AO1 for
_every single question_. Its 53% agreement is not 53% skill — it is the
base rate, reproduced exactly, by a constant. A coin would have done as
well and been more honest about it.

The margin says why. The two objectives sit 0.022 apart in cosine
distance from a question that is nominally about one of them — which is
to say they are indistinguishable. And the reason is the useful part:

> **An embedding measures what a text is about. An assessment objective
> is not about anything.**

AO1 reads "Knowledge with understanding: scientific phenomena, facts,
laws, definitions, concepts and theories". AO2 reads "Handling
information and problem-solving: locate, select, organise and present
information". A physics question is about forces, or refraction, or
half-life. It shares surface vocabulary with AO1 — which names scientific
things — and almost none with AO2, which names _processes a candidate
performs_. So AO1 wins every time, for every question, regardless of what
the question actually demands.

The distinction Phase 4 needed is cognitive demand: does this question
ask you to recall something, or to do something with it? That is a
property of the task, not of the subject matter, and semantic similarity
is the wrong instrument for it — not a weak one, the wrong kind. More
embedding would not help.

**What would.** A model asked to judge the question, rather than a
distance measured against a definition — which is Phase 7 territory, and
needs an evaluation designed around having no labels. Or the marks-and-
command-word structure Phase 4 already has, extended. The gap stays open,
now with a measured reason instead of an expectation.

**The lesson, which is the most valuable thing in this phase:** a
plausible plan recorded in a roadmap is still a guess. This one survived
four phases unexamined because it sounded right. One 21-embedding
experiment settled it, and the cost of not running that experiment would
have been building Phase 6 on top of it.

## Known Limitations (Deferred, Not Blocking)

- **The multiple-choice assessment-objective gap.** Still open, and now
  known not to be an embedding problem at all — semantic similarity
  measures subject matter, and the AO1/AO2 distinction is cognitive
  demand. Measured, not assumed; see
  [above](#phase-4s-second-promise-answered-and-the-answer-is-no).
  A model asked to judge the question is the next thing to try, in
  Phase 7.
- **Per-question objectives are measured, not stored.** 20 of 20 retrieve
  correctly; nothing yet writes the result back onto a question.
- **Recall is measured on one session.** 483 chunks from June 2024. A
  corpus twenty times larger is a different retrieval problem, and the
  number would have to be re-measured rather than assumed to hold.
- **Diagram-dependent questions embed only their text.** A question whose
  meaning lives in Fig. 3.1 gets a vector built from the words around the
  figure. `hasDiagram` records that this happened so a consumer can
  filter on it, but the picture itself is not embedded. That needs a
  multimodal model, and is Phase 8's territory.
- **The HNSW index is correct but not yet exercised.** At 483 rows the
  planner picks a sequential scan, because for a table this small that
  genuinely is cheaper. Forcing `enable_seqscan = off` confirms the index
  is used and matched to the `<=>` operator, so it is right and waiting —
  but every measurement in this note was taken over a full scan, and the
  index's own recall behaviour is therefore untested. Its parameters are
  at their defaults deliberately: tuning them against a corpus where they
  never engage would be tuning against nothing.
- **No migration history table.** There is one migration and every
  statement in it is `IF NOT EXISTS`. A versioning scheme invented before
  the second migration exists would be guesswork. The moment the schema
  changes rather than grows is the moment to add one.
- **No hybrid search or reranking.** Vector search alone misses exact
  matches — a query for "0625/41 Q3" is a lookup, not a similarity
  problem. BM25 fusion and reranking are Phase 6.
- **One subject, one board.** Everything is validated against Cambridge
  IGCSE Physics 0625.

## Production Principle

> A vector is not readable, not reproducible from itself, and not
> comparable across models. Store the exact text you embedded and the
> model that embedded it beside every vector, or you have stored
> something you can neither explain nor rebuild.

Every row in `embedding_chunks` carries its `content`, its
`content_hash` and its `embedding_model`. That is what makes the store
re-runnable when the model changes, auditable when a retrieval looks
wrong, and cheap to update when a paper is re-parsed — and it is the same
instinct as Phase 4's verbatim examiner quotes, applied to something that
cannot be read.

## Concrete Implementation Reference

| Concern                           | Where                                              |
| --------------------------------- | -------------------------------------------------- |
| Chunk and vector contracts        | `embeddings/types/chunk.ts`                        |
| The embedder contract             | `embeddings/types/embedder.ts`                     |
| Question chunking                 | `embeddings/chunking/chunk-questions.ts`           |
| Learning objective chunking       | `embeddings/chunking/chunk-learning-objectives.ts` |
| Examiner insight chunking         | `embeddings/chunking/chunk-examiner-insights.ts`   |
| Context headers                   | `embeddings/chunking/compose-chunk-text.ts`        |
| Ids and content hashes            | `embeddings/chunking/chunk-identity.ts`            |
| Deterministic test embedder       | `embeddings/embedders/fake-embedder.ts`            |
| Gemini over plain fetch           | `embeddings/embedders/gemini-embedder.ts`          |
| Incremental embedding             | `embeddings/pipeline/build-embedding-document.ts`  |
| Schema, indexes and their reasons | `vector-store/migrations/001-init.sql`             |
| Store, upsert and search          | `vector-store/pipeline/create-pg-vector-store.ts`  |
| Filter to parameterised SQL       | `vector-store/pipeline/build-search-query.ts`      |
| Retrieval quality harness         | `vector-store/src/retrieval-quality.test.ts`       |
| Corpus probe                      | `playground/probe-embeddings.ts`                   |
