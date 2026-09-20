import { describe, expect, it } from 'vitest'

import { sourceHit } from '../test-fixtures'
import type { TopicBrief } from '../types/generator'
import { buildGenerationPrompt } from './build-generation-prompt'

function brief(overrides: Partial<TopicBrief> = {}): TopicBrief {
  return {
    syllabusCode: '0625',
    topicNumber: 3,
    topicName: 'Waves',
    questionCount: 2,
    marks: 10,
    objectives: [sourceHit('obj-1', 'Header line\n\ndescribe refraction')],
    exemplars: [
      sourceHit('ex-1', 'Header line\n\nA ray of light enters a glass block.'),
    ],
    insights: [
      sourceHit('ins-1', 'Header line\n\nCandidates confused reflection.'),
    ],
    multipleChoice: false,
    ...overrides,
  }
}

describe('buildGenerationPrompt', () => {
  it('states the syllabus, topic, count and marks', () => {
    const prompt = buildGenerationPrompt(brief())

    expect(prompt).toContain('syllabus 0625')
    expect(prompt).toContain('topic 3 (Waves)')
    expect(prompt).toContain('exactly 2 question(s) worth 10 marks')
  })

  it('tells the model not to rewrite the examples', () => {
    // The product's promise, and the instruction a model is most prone
    // to soften into "inspired by". Asserted so it cannot be edited
    // away unnoticed.
    const prompt = buildGenerationPrompt(brief())

    expect(prompt).toContain('Write NEW questions')
    expect(prompt).toContain(
      'Changing the numbers in an example is not a new question'
    )
  })

  it('includes the syllabus objectives, exemplars and examiner insights', () => {
    const prompt = buildGenerationPrompt(brief())

    expect(prompt).toContain('describe refraction')
    expect(prompt).toContain('A ray of light enters a glass block.')
    expect(prompt).toContain('Candidates confused reflection.')
  })

  it('strips the retrieval header from every chunk', () => {
    // The header exists to help retrieval find a chunk. Inside a prompt
    // it is noise that invites the model to copy the paper code.
    const prompt = buildGenerationPrompt(brief())

    expect(prompt).not.toContain('Header line')
  })

  it('asks for options on a multiple-choice paper and sub-parts otherwise', () => {
    expect(buildGenerationPrompt(brief({ multipleChoice: true }))).toContain(
      'four options labelled A to D with exactly one correct'
    )
    expect(buildGenerationPrompt(brief({ multipleChoice: false }))).toContain(
      'lettered sub-parts'
    )
  })

  it('omits sections the brief has nothing for', () => {
    const thin = buildGenerationPrompt(
      brief({ objectives: [], exemplars: [], insights: [] })
    )

    expect(thin).not.toContain('The syllabus requires')
    expect(thin).not.toContain('Past questions from this board')
    expect(thin).not.toContain("Examiners' reports")
    // The rules still apply, thin context or not.
    expect(thin).toContain('Write NEW questions')
  })

  it('states the objective shares, not merely which objectives exist', () => {
    // A first run listed "AO1, AO2, AO3" and came back 25/55/20 against
    // a 50/30/20 specification. The model had no way to know the
    // proportions.
    const prompt = buildGenerationPrompt(
      brief({
        assessmentObjectiveWeights: { AO1: 50, AO2: 30, AO3: 20 },
        difficultyMix: { low: 30, moderate: 50, high: 20 },
      })
    )

    expect(prompt).toContain('50% AO1, 30% AO2, 20% AO3')
    expect(prompt).toContain('Count marks, not questions')
    expect(prompt).toContain('30% low')
  })

  it("asks for the board's own register, not generic exam prose", () => {
    // Both rules come from reading real output: a first run wrote "the
    // behavior of water waves" for a British board and opened four
    // stems with "This question is about", which no Cambridge paper
    // does. A model writes plausible exam prose by default, not this
    // board's.
    const prompt = buildGenerationPrompt(brief())

    expect(prompt).toContain('British English spelling')
    expect(prompt).toContain('Never open with "This question is about"')
  })

  it('always requires a mark scheme and a diagram brief', () => {
    const prompt = buildGenerationPrompt(brief())

    expect(prompt).toContain('Give a mark scheme for every question')
    expect(prompt).toContain('Do not refer to a figure you have not described')
  })

  it('handles a topic with no name', () => {
    const prompt = buildGenerationPrompt(brief({ topicName: undefined }))

    expect(prompt).toContain('topic 3')
    expect(prompt).not.toContain('undefined')
  })
})
