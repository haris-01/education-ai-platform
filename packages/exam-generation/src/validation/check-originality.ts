import type { SearchHit } from '@education-ai/vector-store'

import type { GeneratedQuestion } from '../types/generated-paper'
import { trigramSimilarity } from './text-similarity'

// Above this, a question is treated as a rewrite of its source rather
// than a new question.
//
// Measured, not guessed. The first version used 0.5 on the reasoning
// that "half the trigrams shared is a lot", and a question with its
// numbers swapped scored 0.41 and sailed through.
//
// The corpus settles it. Across all 5,671 pairs of real, distinct
// Cambridge questions — every one original by definition — similarity
// is: median 0.000, p99 0.022, p99.9 0.106. Exam prose is far less
// formulaic than it reads, so the floor is very low and 0.35 leaves a
// wide margin.
//
// Four real pairs exceed it, and they are worth knowing about because
// they are what a false positive looks like:
//
//   0.90, 0.50, 0.42  0625/51 vs 0625/61, questions 4, 2 and 1
//                     The practical paper and its alternative ask
//                     deliberately the same questions. True
//                     near-duplicates; flagging them is correct.
//   0.44              0625/41 Q9 vs 0625/31 Q11, both on the Sun.
//                     Genuinely different questions. A false positive.
//
// One false positive in 5,671 pairs, and it sits close to the
// numbers-swap case at 0.41 — so this measure cannot cleanly separate
// "rewrote the source" from "same topic, similar framing". That is why
// the result is a finding for a human to look at rather than a verdict,
// and why `validatePaper` does not consume it as an error.
const DEFAULT_MAX_SIMILARITY = 0.35

export interface OriginalityFinding {
  questionNumber: number

  // The chunk it most resembles.
  sourceChunkId: string

  similarity: number
}

export interface OriginalityReport {
  findings: OriginalityFinding[]

  // The worst score seen, whether or not it breached. Useful as a trend:
  // a model drifting toward copying shows up here before it trips.
  maxSimilarity: number
}

// Checks generated questions against the material they were generated
// from.
//
// This is the product's central promise made checkable. The roadmap asks
// for "brand new papers — not copies, not modified papers", and a
// generator told to be original in a prompt will report that it was. The
// only way to know is to measure the output against the input, which is
// deterministic, needs no model, and runs on every paper.
//
// Every question is compared against every retrieved chunk, not only the
// ones it listed as sources — a generator that copies from a chunk and
// then omits it from `sourceChunkIds` is the exact case worth catching.
export function checkOriginality(
  questions: GeneratedQuestion[],
  sources: SearchHit[],
  maxSimilarity = DEFAULT_MAX_SIMILARITY
): OriginalityReport {
  const scored = questions.map((question) => {
    const text = fullText(question)

    return sources.reduce(
      (worst, source) => {
        const similarity = trigramSimilarity(text, source.content)

        if (similarity <= worst.similarity) {
          return worst
        }

        return {
          questionNumber: question.questionNumber,
          sourceChunkId: source.id,
          similarity,
        }
      },
      {
        questionNumber: question.questionNumber,
        sourceChunkId: '',
        similarity: 0,
      }
    )
  })

  return {
    findings: scored.filter((entry) => entry.similarity > maxSimilarity),
    maxSimilarity: scored.reduce(
      (highest, entry) => Math.max(highest, entry.similarity),
      0
    ),
  }
}

// The whole question as a candidate reads it. Comparing stems alone
// would miss a question whose sub-parts were lifted wholesale.
function fullText(question: GeneratedQuestion): string {
  return [
    question.text,
    ...question.parts.flatMap(partText),
    ...question.options.map((option) => option.text),
  ].join(' ')
}

function partText(part: GeneratedQuestion['parts'][number]): string[] {
  return [part.text, ...(part.subParts ?? []).flatMap(partText)]
}
