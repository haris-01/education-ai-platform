import { describe, expect, it, vi } from 'vitest'

import { createFakeDiagramGenerator } from '../generators/fake-diagram-generator'
import type { DiagramGenerator } from '../types/diagram'
import { generatePaperDiagrams } from './generate-paper-diagrams'

const REQUESTS = [
  { questionNumber: 1, brief: 'A trolley on a ramp.' },
  { questionNumber: 4, brief: 'A ray entering a glass block.' },
]

describe('generatePaperDiagrams', () => {
  it('draws a figure for every question that asked for one', async () => {
    const result = await generatePaperDiagrams(
      REQUESTS,
      createFakeDiagramGenerator()
    )

    expect([...result.byQuestion.keys()]).toEqual([1, 4])
    expect(result.failures).toEqual([])
  })

  it('labels each figure by its question number', async () => {
    const result = await generatePaperDiagrams(
      REQUESTS,
      createFakeDiagramGenerator()
    )

    expect(result.byQuestion.get(4)?.label).toBe('Fig. 4.1')
  })

  it('keeps the figures it drew when one fails', async () => {
    // One rejected SVG out of eleven must not lose the other ten —
    // they cost a model call each.
    const flaky: DiagramGenerator = {
      model: 'flaky',
      generate: vi.fn(async (brief) => {
        if (brief.label === 'Fig. 1.1') {
          throw new Error('Generated SVG was rejected: contains a script.')
        }
        return createFakeDiagramGenerator().generate(brief)
      }),
    }

    const result = await generatePaperDiagrams(REQUESTS, flaky)

    expect([...result.byQuestion.keys()]).toEqual([4])
    expect(result.failures).toEqual([
      {
        questionNumber: 1,
        reason: 'Generated SVG was rejected: contains a script.',
      },
    ])
  })

  it('names which questions are unillustrated rather than throwing', async () => {
    // The caller decides whether to ship, retry, or regenerate those
    // questions without figures — and cannot decide without knowing.
    const broken: DiagramGenerator = {
      model: 'broken',
      generate: vi.fn(() => Promise.reject(new Error('quota exhausted'))),
    }

    const result = await generatePaperDiagrams(REQUESTS, broken)

    expect(result.byQuestion.size).toBe(0)
    expect(result.failures.map((f) => f.questionNumber)).toEqual([1, 4])
  })

  it('does nothing for a paper that needs no figures', async () => {
    const result = await generatePaperDiagrams([], createFakeDiagramGenerator())

    expect(result.byQuestion.size).toBe(0)
    expect(result.failures).toEqual([])
  })
})
