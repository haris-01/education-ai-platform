import { createHash } from 'node:crypto'

import type { EmbedTaskType, Embedder } from '../types/embedder'

// A deterministic stand-in for a real embedding model.
//
// It is not a weak model — it has no semantics at all. Its only promise
// is that the same text always yields the same unit vector and different
// text almost always yields a different one, which is exactly what is
// needed to test chunking, storage, upsert idempotency and vector-column
// round-tripping. Those tests then run with no API key, no network and
// no cost, which is what keeps the suite runnable by anyone who clones
// the repo.
//
// Anything that measures retrieval *quality* has to use a real embedder,
// and this one will happily give a confident, meaningless answer if
// misused for that — hence the name.
export function createFakeEmbedder(dimensions = 768): Embedder {
  return {
    model: `fake-embedder-${dimensions}`,
    dimensions,
    embed: async (
      texts: string[],
      taskType: EmbedTaskType
    ): Promise<number[][]> =>
      texts.map((text) => pseudoVector(`${taskType}:${text}`, dimensions)),
  }
}

// Expands a SHA-256 digest into as many components as are needed by
// re-hashing with a counter, then normalises. Normalising matters: with
// cosine distance an unnormalised vector's magnitude would leak into the
// ranking and make the fake behave differently from a real embedder,
// which returns unit vectors.
function pseudoVector(text: string, dimensions: number): number[] {
  const bytes = expandDigest(text, dimensions)
  const raw = bytes.map((byte) => byte / 255 - 0.5)
  const magnitude = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0))

  if (magnitude === 0) {
    return raw
  }

  return raw.map((v) => v / magnitude)
}

function expandDigest(text: string, dimensions: number): number[] {
  const rounds = Math.ceil(dimensions / 32)

  return Array.from({ length: rounds })
    .flatMap((_unused, round) => [
      ...createHash('sha256').update(`${round}:${text}`, 'utf8').digest(),
    ])
    .slice(0, dimensions)
}
