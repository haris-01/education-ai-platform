import { describe, expect, it } from 'vitest'

import {
  examinerReport,
  question,
  questionComment,
  questionDocument,
} from '../test-fixtures'
import { estimateDifficulty } from './estimate-difficulty'

function estimate(comment: string) {
  const [assignment] = estimateDifficulty(
    questionDocument([question(1)]),
    examinerReport([questionComment(1, comment)])
  ).assignments
  return assignment
}

describe('estimateDifficulty', () => {
  describe('bands', () => {
    it('reads a large share succeeding as low difficulty', () => {
      // Real 0625/41 commentary.
      const assignment = estimate(
        'The vast majority of candidates correctly recalled and used the equation F = ma.'
      )

      expect(assignment.band).toBe('low')
      expect(assignment.evidence).toEqual([
        {
          band: 'low',
          phrase: 'the vast majority of candidates',
          outcome: 'success',
          sentence:
            'The vast majority of candidates correctly recalled and used the equation F = ma.',
        },
      ])
    })

    it('reads a small share succeeding as high difficulty', () => {
      const assignment = estimate(
        'Only stronger candidates gave the correct answer of constant speed.'
      )

      expect(assignment.band).toBe('high')
      expect(assignment.evidence[0].phrase).toBe('only stronger candidates')
    })

    it('reads a middling share succeeding as moderate difficulty', () => {
      const assignment = estimate(
        'Many candidates correctly calculated the speed of trolley P.'
      )

      expect(assignment.band).toBe('moderate')
    })

    it('reads a large share failing as high difficulty', () => {
      const assignment = estimate(
        'Most candidates did not identify a difference in particle motion.'
      )

      expect(assignment.band).toBe('high')
      expect(assignment.evidence[0].outcome).toBe('failure')
    })

    it('reads a small share failing as low difficulty', () => {
      // "Few candidates made this error" means the question was easy —
      // the table has to flip on both axes, not just one.
      const assignment = estimate('Few candidates incorrectly stated the unit.')

      expect(assignment.band).toBe('low')
    })
  })

  describe('mixed sentences', () => {
    it('treats a sentence that negates a success word as a failure', () => {
      // Real commentary. It contains "gave" and reads positively at the
      // start, but reports a shortfall — scoring it as a success would
      // make a hard question look easy.
      const assignment = estimate(
        'Almost all candidates gave a region of the electromagnetic spectrum but many of these did not give a region that has wavelengths longer than infrared.'
      )

      expect(assignment.evidence[0].outcome).toBe('failure')
      expect(assignment.band).toBe('high')
    })

    it('averages evidence across a question with easy and hard parts', () => {
      const assignment = estimate(
        'Most candidates correctly gave the unit. Only stronger candidates correctly identified X as a north pole.'
      )

      expect(assignment.evidence.map((e) => e.band)).toEqual(['low', 'high'])
      // Averaged rather than voted on: half easy and half hard is a
      // moderate question, not whichever side had one more sentence.
      expect(assignment.band).toBe('moderate')
    })
  })

  describe('difficulty the examiner states outright', () => {
    // Multiple-choice commentary is written as a verdict on the item
    // rather than a walk through sub-parts, so without these markers
    // almost none of an MCQ paper could be banded.
    it('reads "found this question challenging" as high', () => {
      const assignment = estimate('Candidates found this question challenging.')

      expect(assignment.band).toBe('high')
      expect(assignment.evidence[0].phrase).toBe('stated difficulty')
    })

    it('reads evidence of guesswork as high', () => {
      const assignment = estimate(
        'The majority of candidates demonstrated poor knowledge about seismic waves with strong evidence of guesswork as answers were spread across all four options almost equally.'
      )

      expect(assignment.band).toBe('high')
    })

    it('reads "demonstrated good knowledge" as low', () => {
      const assignment = estimate(
        'Candidates demonstrated good knowledge about the radiation emitted by the Sun.'
      )

      expect(assignment.band).toBe('low')
    })

    it('prefers a stated verdict over the quantifier rules', () => {
      // "Most candidates" + a success word would infer "low" on its own.
      // The examiner's own verdict is the better evidence and wins.
      const assignment = estimate(
        'Most candidates struggled to recall the correct facts.'
      )

      expect(assignment.evidence[0].phrase).toBe('stated difficulty')
      expect(assignment.band).toBe('high')
    })
  })

  describe('cohort-qualified quantifiers', () => {
    it('reads "most stronger candidates succeeded" as high', () => {
      // Real 0625/11 commentary. It says the strong cohort managed it,
      // which means most candidates did not — reading "most" here as a
      // large share would invert the answer.
      const assignment = estimate(
        'Most stronger candidates chose the correct option.'
      )

      expect(assignment.evidence[0].phrase).toBe('most stronger candidates')
      expect(assignment.band).toBe('high')
    })

    it('reads "many weaker candidates got it wrong" as high', () => {
      const assignment = estimate(
        'Many weaker candidates incorrectly believed that the smoke particles moved randomly because they are less dense than air.'
      )

      expect(assignment.evidence[0].phrase).toBe('many weaker candidates')
      expect(assignment.band).toBe('high')
    })
  })

  describe('longest-match quantifiers', () => {
    it('does not report "the vast majority" as "the majority"', () => {
      const assignment = estimate(
        'The vast majority of candidates answered correctly.'
      )

      expect(assignment.evidence[0].phrase).toBe(
        'the vast majority of candidates'
      )
    })

    it('distinguishes "a few candidates" from "few candidates"', () => {
      const assignment = estimate('A few candidates answered correctly.')

      expect(assignment.evidence[0].phrase).toBe('a few candidates')
      expect(assignment.evidence[0].band).toBe('high')
    })
  })

  describe('gaps', () => {
    it('has no band when the sentence has no quantifier', () => {
      const assignment = estimate('This question was about refraction.')

      expect(assignment.band).toBeUndefined()
      expect(assignment.evidence).toEqual([])
    })

    it('has no band when a quantifier carries no outcome', () => {
      const assignment = estimate('Most candidates attempted this question.')

      expect(assignment.band).toBeUndefined()
    })

    it('has no band when the report does not mention the question', () => {
      const [assignment] = estimateDifficulty(
        questionDocument([question(1)]),
        examinerReport([questionComment(2, 'Most candidates were correct.')])
      ).assignments

      expect(assignment.band).toBeUndefined()
    })

    it('has no band when no examiner report is supplied at all', () => {
      const { assignments } = estimateDifficulty(
        questionDocument([question(1), question(2)])
      )

      expect(assignments.map((a) => a.band)).toEqual([undefined, undefined])
    })

    it('covers every question either way', () => {
      const { assignments } = estimateDifficulty(
        questionDocument([question(1), question(2), question(3)]),
        examinerReport([questionComment(2, 'Most candidates were correct.')])
      )

      expect(assignments.map((a) => a.questionNumber)).toEqual([1, 2, 3])
    })
  })
})
