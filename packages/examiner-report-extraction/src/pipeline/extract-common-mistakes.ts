import { splitSentences } from '@education-ai/shared'

// Sentence-level markers for a candidate error, taken from the language
// Cambridge principal examiners actually use. Each was read off a real
// 0625 report rather than imagined:
//
//   "A common misunderstanding among weaker candidates was to assume ..."
//   "A common error was to give an answer about a change in state ..."
//   "Convection was the most common incorrect thermal process given."
//   "Weaker answers referred to inter-molecular spacing ..."
//   "Ambiguous answers such as ... did not identify a difference ..."
//   "Other candidates assigned incorrect mass values ..."
//
// Deliberately requiring an explicit error word, so that a sentence
// describing what a good answer looked like ("Stronger answers were well
// structured") is not collected as a mistake.
const MISTAKE_MARKERS = [
  /\ba common (error|mistake|misunderstanding|misconception)\b/i,
  /\bcommon(ly)? (incorrect|wrong|omitted|confused)\b/i,
  /\bmost common incorrect\b/i,
  /\bweaker (candidates|answers|responses)\b/i,
  /\bincorrect(ly)?\b/i,
  /\bdid not (identify|state|give|realise|realize|include|answer|gain|make)\b/i,
  /\bfailed to\b/i,
  /\b(confused|confusing) .{0,40}\bwith\b/i,
  /\bomitted\b/i,
  /\bmisread\b/i,
  /\bnot a correct\b/i,
  /\bambiguous answers?\b/i,
]

// Sub-part labels the report uses to introduce a section — "(a)", "(b)
// (i)", "(c)(ii)". Stripped from the front of a sentence so a collected
// mistake reads as prose rather than starting mid-label.
const LEADING_PART_LABEL = /^(\([a-z]+\)\s*){1,3}/i

/**
 * Pulls the sentences describing candidate errors out of one question's
 * examiner commentary.
 *
 * Deterministic marker matching, not summarisation: every string returned
 * is verbatim from the report. That keeps the output quotable and
 * auditable — a teacher can check it against the source — where a
 * generated paraphrase could not be trusted the same way. The cost is
 * that a mistake described without one of these markers is missed, which
 * is the safe direction to fail.
 */
export function extractCommonMistakes(comment: string): string[] {
  return splitSentences(comment)
    .map((sentence) => sentence.replace(LEADING_PART_LABEL, '').trim())
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) =>
      MISTAKE_MARKERS.some((marker) => marker.test(sentence))
    )
}
