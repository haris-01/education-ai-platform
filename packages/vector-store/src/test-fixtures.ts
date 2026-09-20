import type { EmbeddingChunk } from '@education-ai/embeddings'

// A vector pointing along one axis. Two of these are orthogonal unless
// they share an axis, which makes the expected cosine ordering in a test
// something you can read off the fixtures rather than discover by
// running them.
export function axisVector(axis: number, dimensions = 768): number[] {
  return Array.from({ length: dimensions }, (_unused, i) =>
    i === axis % dimensions ? 1 : 0
  )
}

// A unit vector mostly along `axis` but leaning towards `towards`, so it
// ranks between the two. Used to assert that ordering follows direction
// and not insertion order.
export function tiltedVector(
  axis: number,
  towards: number,
  weight = 0.25,
  dimensions = 768
): number[] {
  const raw = Array.from({ length: dimensions }, (_unused, i) => {
    if (i === axis % dimensions) {
      return 1
    }
    if (i === towards % dimensions) {
      return weight
    }
    return 0
  })
  const magnitude = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0))

  return raw.map((v) => v / magnitude)
}

export function embeddingChunk(
  id: string,
  embedding: number[],
  overrides: Partial<EmbeddingChunk> = {}
): EmbeddingChunk {
  return {
    id,
    chunkType: 'question',
    sourceDocumentId: 'CAM-0625-MJ-2024-41-QP',
    content: `content for ${id}`,
    contentHash: `hash-${id}`,
    payload: {},
    embeddingModel: 'fake-embedder-768',
    embedding,
    ...overrides,
    metadata: {
      assessmentObjectives: [],
      hasDiagram: false,
      isExemplar: true,
      ...overrides.metadata,
    },
  }
}
