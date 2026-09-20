import { describe, expect, it } from 'vitest'

import { option, question, sourceHit, subPart } from '../test-fixtures'
import { checkOriginality } from './check-originality'

const EXEMPLAR = sourceHit(
  'chunk-1',
  'A trolley of mass 2.0 kg rolls down a ramp of length 3 m. Calculate the acceleration of the trolley.'
)

describe('checkOriginality', () => {
  it('passes a genuinely new question', () => {
    const report = checkOriginality(
      [
        question(1, {
          text: 'A cyclist brakes from 12 m/s to rest in 4 seconds. Determine the deceleration.',
        }),
      ],
      [EXEMPLAR]
    )

    expect(report.findings).toEqual([])
    expect(report.maxSimilarity).toBeLessThan(0.3)
  })

  it('catches a source question with its numbers swapped', () => {
    // The product's central promise — "not copies, not modified papers"
    // — made checkable. A generator told to be original in a prompt
    // will report that it was; only measuring output against input
    // knows.
    const report = checkOriginality(
      [
        question(1, {
          text: 'A trolley of mass 3.5 kg rolls down a ramp of length 8 m. Calculate the acceleration of the trolley.',
        }),
      ],
      [EXEMPLAR]
    )

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      questionNumber: 1,
      sourceChunkId: 'chunk-1',
    })
    expect(report.findings[0].similarity).toBeGreaterThan(0.35)
  })

  it('checks against every source, not only the ones the question claims', () => {
    // A generator that copies a chunk and then omits it from
    // sourceChunkIds is exactly the case worth catching.
    const report = checkOriginality(
      [
        question(1, {
          sourceChunkIds: ['chunk-999'],
          text: 'A trolley of mass 3.5 kg rolls down a ramp of length 8 m. Calculate the acceleration of the trolley.',
        }),
      ],
      [EXEMPLAR]
    )

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0].sourceChunkId).toBe('chunk-1')
  })

  it('compares sub-parts and options, not just the stem', () => {
    // A fresh stem with lifted sub-parts is still a copy.
    const report = checkOriginality(
      [
        question(1, {
          text: 'Study the apparatus shown.',
          parts: [
            subPart(
              'a',
              'A trolley of mass 2.0 kg rolls down a ramp of length 3 m. Calculate the acceleration of the trolley.',
              4
            ),
          ],
        }),
      ],
      [EXEMPLAR]
    )

    expect(report.findings).toHaveLength(1)
  })

  it('reports the worst score even when nothing breached', () => {
    // A model drifting toward copying shows up here before it trips.
    const report = checkOriginality(
      [question(1, { text: 'A trolley of mass 2.0 kg sits at rest.' })],
      [EXEMPLAR]
    )

    expect(report.findings).toEqual([])
    expect(report.maxSimilarity).toBeGreaterThan(0)
  })

  it('honours a stricter threshold', () => {
    const questions = [
      question(1, { text: 'A trolley of mass 2.0 kg sits at rest on a ramp.' }),
    ]

    expect(checkOriginality(questions, [EXEMPLAR]).findings).toHaveLength(0)
    expect(checkOriginality(questions, [EXEMPLAR], 0.1).findings).toHaveLength(
      1
    )
  })

  it('names the closest source when several are similar', () => {
    const report = checkOriginality(
      [
        question(1, {
          text: 'A trolley of mass 3.5 kg rolls down a ramp of length 8 m. Calculate the acceleration of the trolley.',
        }),
      ],
      [sourceHit('chunk-far', 'Describe the structure of the Sun.'), EXEMPLAR]
    )

    expect(report.findings[0].sourceChunkId).toBe('chunk-1')
  })

  it('handles a paper with no sources to compare against', () => {
    const report = checkOriginality([question(1)], [])

    expect(report.findings).toEqual([])
    expect(report.maxSimilarity).toBe(0)
  })

  it('checks multiple-choice options too', () => {
    const report = checkOriginality(
      [
        question(1, {
          text: 'Which value is correct?',
          options: [
            option(
              'A',
              'A trolley of mass 2.0 kg rolls down a ramp of length 3 m',
              true
            ),
            option('B', 'Calculate the acceleration of the trolley'),
          ],
        }),
      ],
      [EXEMPLAR]
    )

    expect(report.findings).toHaveLength(1)
  })
})
