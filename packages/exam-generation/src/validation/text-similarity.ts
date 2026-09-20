// Word-trigram Jaccard similarity, 0 to 1.
//
// Trigrams of words rather than characters, and Jaccard rather than
// edit distance, because the thing being caught is a question rebuilt
// from the same phrases — not a typo. "A trolley of mass 2.0 kg rolls
// down a ramp" against "A trolley of mass 3.5 kg rolls down a slope" is
// the case that matters: nearly every trigram survives, so the score
// stays high even though every number changed. Edit distance would call
// those far apart, which is exactly the wrong answer.
export function trigramSimilarity(left: string, right: string): number {
  const a = wordTrigrams(left)
  const b = wordTrigrams(right)

  if (a.size === 0 || b.size === 0) {
    return 0
  }

  const shared = [...a].filter((gram) => b.has(gram)).length
  const union = a.size + b.size - shared

  if (union === 0) {
    return 0
  }

  return shared / union
}

function wordTrigrams(text: string): Set<string> {
  const words = normalise(text).split(' ').filter(Boolean)

  if (words.length < 3) {
    // Too short to trigram. Compare as a single unit rather than
    // returning nothing, or a three-word question would always score 0
    // and never be caught.
    return new Set(words.length > 0 ? [words.join(' ')] : [])
  }

  return new Set(
    words.slice(0, -2).map((_word, i) => words.slice(i, i + 3).join(' '))
  )
}

// Numbers are deliberately kept. Changing 2.0 kg to 3.5 kg is the
// laziest way to "write a new question", and normalising digits away
// would make this blind to precisely that.
//
// Everything else punctuation-like goes, including the decimal point's
// lookalikes: a full stop ending a sentence differs between two
// extractions of the same text, so keeping it would make "the mass."
// and "the mass" different words. Decimal points *between digits* are
// protected first, so 2.0 survives as one token rather than becoming
// "2 0".
function normalise(text: string): string {
  return (
    text
      .toLowerCase()
      // A period that is not between two digits: sentence-ending, so it
      // goes. One between digits is a decimal point and stays, which is
      // what keeps 2.0 a single token rather than "2 0".
      .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
      .replace(/[^a-z0-9.\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
