import type { GenerationContext } from '@education-ai/vector-store'
import { describe, expect, it } from 'vitest'

import { createFakeGenerator } from '../generators/fake-generator'
import { sourceHit, spec } from '../test-fixtures'
import { generatePaper } from './generate-paper'

function context(
  topics: { topicNumber: number; exemplars?: number }[],
  shortfalls: string[] = []
): GenerationContext {
  return {
    topics: topics.map((topic) => ({
      topicNumber: topic.topicNumber,
      topicName: `Topic ${topic.topicNumber}`,
      objectives: [sourceHit(`obj-${topic.topicNumber}`, 'an objective')],
      exemplars: Array.from({ length: topic.exemplars ?? 2 }, (_u, i) =>
        sourceHit(`ex-${topic.topicNumber}-${i}`, `exemplar ${i}`)
      ),
      insights: [sourceHit(`ins-${topic.topicNumber}`, 'an insight')],
    })),
    shortfalls,
  }
}

const GENERATOR = createFakeGenerator()

describe('generatePaper', () => {
  it('produces a paper that satisfies its specification', async () => {
    const result = await generatePaper({
      spec: spec({
        totalMarks: 40,
        topics: [
          { topicNumber: 1, questionCount: 3 },
          { topicNumber: 3, questionCount: 2 },
        ],
      }),
      context: context([{ topicNumber: 1 }, { topicNumber: 3 }]),
      generator: GENERATOR,
    })

    expect(result.validation.valid).toBe(true)
    expect(result.validation.violations).toEqual([])
    expect(result.paper.totalMarks).toBe(40)
    expect(result.paper.questions).toHaveLength(5)
  })

  it('numbers questions across the paper, not within each topic', async () => {
    // Generators number from 1 inside their own topic because they are
    // not told what else is on the paper.
    const result = await generatePaper({
      spec: spec({
        totalMarks: 20,
        topics: [
          { topicNumber: 1, questionCount: 2 },
          { topicNumber: 3, questionCount: 2 },
        ],
      }),
      context: context([{ topicNumber: 1 }, { topicNumber: 3 }]),
      generator: GENERATOR,
    })

    expect(result.paper.questions.map((q) => q.questionNumber)).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('splits marks so the paper adds up exactly', async () => {
    // 37 over 5 questions does not divide. Letting each topic round
    // independently would miss the total, which validatePaper treats as
    // an error — correctly, since a paper whose marks do not add up is
    // not a paper.
    const result = await generatePaper({
      spec: spec({
        totalMarks: 37,
        topics: [
          { topicNumber: 1, questionCount: 3 },
          { topicNumber: 3, questionCount: 2 },
        ],
      }),
      context: context([{ topicNumber: 1 }, { topicNumber: 3 }]),
      generator: GENERATOR,
    })

    expect(result.paper.totalMarks).toBe(37)
    expect(result.validation.valid).toBe(true)
  })

  it('weights marks by question count, not evenly across topics', async () => {
    const result = await generatePaper({
      spec: spec({
        totalMarks: 60,
        topics: [
          { topicNumber: 1, questionCount: 5 },
          { topicNumber: 3, questionCount: 1 },
        ],
      }),
      context: context([{ topicNumber: 1 }, { topicNumber: 3 }]),
      generator: GENERATOR,
    })

    const topicOne = result.paper.questions
      .filter((q) => q.topicNumber === 1)
      .reduce((sum, q) => sum + q.marks, 0)

    expect(topicOne).toBe(50)
  })

  it('carries retrieval shortfalls through rather than dropping them', async () => {
    // A paper built on one exemplar per topic can validate perfectly
    // and still be a bad paper. The reason has to reach the caller.
    const result = await generatePaper({
      spec: spec({
        totalMarks: 8,
        topics: [{ topicNumber: 6, questionCount: 2 }],
      }),
      context: context(
        [{ topicNumber: 6, exemplars: 1 }],
        ['Topic 6: wanted 5 exemplars, found 1.']
      ),
      generator: GENERATOR,
    })

    expect(result.retrievalShortfalls).toEqual([
      'Topic 6: wanted 5 exemplars, found 1.',
    ])
  })

  it('returns the paper even when it fails validation', async () => {
    // A caller deciding what to do with a near-miss has to see it, and
    // throwing would make "regenerate the weak topics" impossible.
    const result = await generatePaper({
      spec: spec({
        totalMarks: 40,
        topics: [{ topicNumber: 1, questionCount: 2 }],
        assessmentObjectiveWeights: { AO1: 0, AO2: 100 },
      }),
      context: context([{ topicNumber: 1 }]),
      generator: GENERATOR,
    })

    expect(result.paper.questions).toHaveLength(2)
    expect(
      result.validation.violations.some(
        (v) => v.code === 'ASSESSMENT_OBJECTIVE_WEIGHTING'
      )
    ).toBe(true)
  })

  it('checks originality against everything retrieved', async () => {
    const result = await generatePaper({
      spec: spec({
        totalMarks: 8,
        topics: [{ topicNumber: 1, questionCount: 2 }],
      }),
      context: context([{ topicNumber: 1 }]),
      generator: GENERATOR,
    })

    expect(result.originality.findings).toEqual([])
    expect(result.originality.maxSimilarity).toBeLessThan(0.35)
  })

  it('records which model wrote the paper', async () => {
    const result = await generatePaper({
      spec: spec({
        totalMarks: 8,
        topics: [{ topicNumber: 1, questionCount: 2 }],
      }),
      context: context([{ topicNumber: 1 }]),
      generator: GENERATOR,
    })

    expect(result.paper.generatorModel).toBe('fake-generator')
  })

  it('generates multiple-choice questions when the paper is one', async () => {
    const result = await generatePaper({
      spec: spec({
        totalMarks: 4,
        topics: [{ topicNumber: 1, questionCount: 4 }],
      }),
      context: context([{ topicNumber: 1 }]),
      generator: GENERATOR,
      multipleChoice: true,
    })

    result.paper.questions.forEach((question) => {
      expect(question.options).toHaveLength(4)
      expect(question.options.filter((o) => o.correct)).toHaveLength(1)
    })
    expect(result.validation.valid).toBe(true)
  })

  it('handles a topic the retrieval found nothing for', async () => {
    const result = await generatePaper({
      spec: spec({
        totalMarks: 8,
        topics: [{ topicNumber: 9, questionCount: 2 }],
      }),
      context: { topics: [], shortfalls: ['Topic 9: nothing found.'] },
      generator: GENERATOR,
    })

    expect(result.paper.questions).toHaveLength(2)
    expect(result.paper.totalMarks).toBe(8)
  })
})
