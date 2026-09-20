import { describe, expect, it, vi } from 'vitest'

import { createFakeEmbedder } from '../embedders/fake-embedder'
import type { Chunk } from '../types/chunk'
import { buildEmbeddingDocument } from './build-embedding-document'

function chunk(id: string, content: string, contentHash = `hash-${id}`): Chunk {
  return {
    id,
    chunkType: 'question',
    sourceDocumentId: 'doc-1',
    content,
    contentHash,
    metadata: { assessmentObjectives: [], hasDiagram: false, isExemplar: true },
    payload: {},
  }
}

const INPUT = {
  resourceId: 'doc-1',
  title: 'June 2024 Question Paper 41',
}

describe('buildEmbeddingDocument', () => {
  it('attaches a vector to every chunk and records what produced them', async () => {
    const embedder = createFakeEmbedder(64)

    const document = await buildEmbeddingDocument({
      ...INPUT,
      chunks: [chunk('a', 'first'), chunk('b', 'second')],
      embedder,
    })

    expect(document.chunks).toHaveLength(2)
    expect(document.chunks[0].embedding).toHaveLength(64)
    expect(document.chunks[0].embeddingModel).toBe('fake-embedder-64')
    expect(document.metadata.embeddingModel).toBe('fake-embedder-64')
    expect(document.metadata.dimensions).toBe(64)
    expect(document.metadata.skippedCount).toBe(0)
  })

  it('keeps each vector with the chunk it was built from', async () => {
    const embedder = createFakeEmbedder(64)
    const document = await buildEmbeddingDocument({
      ...INPUT,
      chunks: [chunk('a', 'first'), chunk('b', 'second')],
      embedder,
    })

    const [direct] = await embedder.embed(['second'], 'document')
    const stored = document.chunks.find((c) => c.id === 'b')

    expect(stored?.embedding).toEqual(direct)
  })

  it('skips a chunk whose stored hash still matches', async () => {
    // Embedding is the only step here that costs money, and the stored
    // row is already correct — so there is nothing to embed and nothing
    // to write.
    const embedder = createFakeEmbedder(64)
    const spy = vi.spyOn(embedder, 'embed')

    const document = await buildEmbeddingDocument({
      ...INPUT,
      chunks: [chunk('a', 'first'), chunk('b', 'second')],
      embedder,
      storedHashes: new Map([['a', 'hash-a']]),
    })

    expect(spy).toHaveBeenCalledWith(['second'], 'document')
    expect(document.chunks.map((c) => c.id)).toEqual(['b'])
    expect(document.metadata.chunkCount).toBe(2)
    expect(document.metadata.skippedCount).toBe(1)
  })

  it('re-embeds a chunk whose content changed under the same id', async () => {
    const embedder = createFakeEmbedder(64)
    const spy = vi.spyOn(embedder, 'embed')

    const document = await buildEmbeddingDocument({
      ...INPUT,
      chunks: [chunk('a', 'edited', 'hash-new')],
      embedder,
      storedHashes: new Map([['a', 'hash-old']]),
    })

    expect(spy).toHaveBeenCalledWith(['edited'], 'document')
    expect(document.chunks).toHaveLength(1)
    expect(document.metadata.skippedCount).toBe(0)
  })

  it('embeds nothing when every chunk is unchanged', async () => {
    const embedder = createFakeEmbedder(64)
    const spy = vi.spyOn(embedder, 'embed')

    const document = await buildEmbeddingDocument({
      ...INPUT,
      chunks: [chunk('a', 'first')],
      embedder,
      storedHashes: new Map([['a', 'hash-a']]),
    })

    expect(spy).toHaveBeenCalledWith([], 'document')
    expect(document.chunks).toEqual([])
    expect(document.metadata.skippedCount).toBe(1)
  })

  it('rejects a vector whose width does not match the embedder', async () => {
    // The vector column's width is part of the database schema, so a
    // mismatch has to fail here rather than at the INSERT.
    const embedder = createFakeEmbedder(64)
    vi.spyOn(embedder, 'embed').mockResolvedValue([new Array(32).fill(0)])

    await expect(
      buildEmbeddingDocument({
        ...INPUT,
        chunks: [chunk('a', 'first')],
        embedder,
      })
    ).rejects.toThrow('expected 64')
  })

  it('rejects a short response rather than silently dropping a chunk', async () => {
    const embedder = createFakeEmbedder(64)
    vi.spyOn(embedder, 'embed').mockResolvedValue([])

    await expect(
      buildEmbeddingDocument({
        ...INPUT,
        chunks: [chunk('a', 'first')],
        embedder,
      })
    ).rejects.toThrow('got 0 dimensions')
  })
})
