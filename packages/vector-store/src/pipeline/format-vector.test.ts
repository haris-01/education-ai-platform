import { describe, expect, it } from 'vitest'

import { formatVector, parseVector } from './format-vector'

describe('formatVector', () => {
  it('writes pgvector text input', () => {
    expect(formatVector([0.1, -0.2, 0.3])).toBe('[0.1,-0.2,0.3]')
  })

  it('handles an empty vector', () => {
    expect(formatVector([])).toBe('[]')
  })
})

describe('parseVector', () => {
  it('round-trips what formatVector wrote', () => {
    const vector = [0.125, -0.5, 0.75]

    expect(parseVector(formatVector(vector))).toEqual(vector)
  })

  it('handles an empty vector', () => {
    expect(parseVector('[]')).toEqual([])
  })
})
