import { describe, expect, it } from 'vitest'

import { createFakeEmbedder } from './fake-embedder'

describe('createFakeEmbedder', () => {
  it('returns one unit vector per input, in order', async () => {
    const embedder = createFakeEmbedder(768)
    const vectors = await embedder.embed(['alpha', 'beta'], 'document')

    expect(vectors).toHaveLength(2)
    vectors.forEach((vector) => {
      expect(vector).toHaveLength(768)
      expect(magnitude(vector)).toBeCloseTo(1, 10)
    })
  })

  it('is deterministic, which is what makes it usable in tests', async () => {
    const embedder = createFakeEmbedder(64)

    expect(await embedder.embed(['alpha'], 'document')).toEqual(
      await embedder.embed(['alpha'], 'document')
    )
  })

  it('separates different text, and the same text by task type', async () => {
    const embedder = createFakeEmbedder(64)
    const [alpha] = await embedder.embed(['alpha'], 'document')
    const [beta] = await embedder.embed(['beta'], 'document')
    const [alphaQuery] = await embedder.embed(['alpha'], 'query')

    expect(alpha).not.toEqual(beta)
    expect(alpha).not.toEqual(alphaQuery)
  })

  it('honours a non-multiple-of-32 dimension count', async () => {
    const embedder = createFakeEmbedder(100)
    const [vector] = await embedder.embed(['alpha'], 'document')

    expect(vector).toHaveLength(100)
  })
})

function magnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
}
