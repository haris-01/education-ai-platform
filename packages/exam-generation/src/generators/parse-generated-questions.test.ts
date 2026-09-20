import { describe, expect, it } from 'vitest'

import { sourceHit } from '../test-fixtures'
import type { TopicBrief } from '../types/generator'
import { parseGeneratedQuestions } from './parse-generated-questions'

const BRIEF: TopicBrief = {
  syllabusCode: '0625',
  topicNumber: 3,
  questionCount: 1,
  marks: 6,
  objectives: [],
  exemplars: [sourceHit('chunk-a', 'an exemplar'), sourceHit('chunk-b', 'two')],
  insights: [],
  multipleChoice: false,
}

function json(questions: unknown): string {
  return JSON.stringify({ questions })
}

const VALID = {
  text: 'Describe how light refracts entering glass.',
  marks: 6,
  assessmentObjective: 'AO1',
  difficulty: 'moderate',
  requiresDiagram: false,
  markScheme: [{ text: 'bends toward the normal', marks: 6 }],
}

describe('parseGeneratedQuestions', () => {
  it('reads a well-formed response', () => {
    const [question] = parseGeneratedQuestions(json([VALID]), BRIEF)

    expect(question).toMatchObject({
      questionNumber: 1,
      topicNumber: 3,
      text: 'Describe how light refracts entering glass.',
      marks: 6,
      assessmentObjective: 'AO1',
      difficulty: 'moderate',
    })
  })

  it('attaches provenance from the brief, not from the response', () => {
    // Asking a model which chunks it used invites it to invent ids, and
    // the pipeline already knows exactly what it supplied.
    const [question] = parseGeneratedQuestions(
      json([{ ...VALID, sourceChunkIds: ['invented-id'] }]),
      BRIEF
    )

    expect(question.sourceChunkIds).toEqual(['chunk-a', 'chunk-b'])
  })

  it('numbers questions within the topic', () => {
    const questions = parseGeneratedQuestions(
      json([VALID, { ...VALID, text: 'A second question about lenses.' }]),
      BRIEF
    )

    expect(questions.map((q) => q.questionNumber)).toEqual([1, 2])
  })

  it('reads sub-parts and options', () => {
    const [withParts] = parseGeneratedQuestions(
      json([
        {
          ...VALID,
          parts: [
            {
              label: 'a',
              text: 'State the law.',
              marks: 6,
              markScheme: [{ text: 'Snell', marks: 6 }],
            },
          ],
        },
      ]),
      BRIEF
    )
    const [withOptions] = parseGeneratedQuestions(
      json([
        {
          ...VALID,
          options: [
            { label: 'A', text: 'toward the normal', correct: true },
            { label: 'B', text: 'away from the normal', correct: false },
          ],
        },
      ]),
      BRIEF
    )

    expect(withParts.parts[0]).toMatchObject({ label: 'a', marks: 6 })
    expect(withOptions.options[0]).toMatchObject({ label: 'A', correct: true })
  })

  it('rejects output that is not JSON, naming why', () => {
    expect(() =>
      parseGeneratedQuestions('Sure! Here you go: {', BRIEF)
    ).toThrow(/not valid JSON/)
  })

  it('rejects a missing field rather than letting undefined through', () => {
    // The whole point of parsing at the boundary: a missing field is an
    // error here, not a paper with no marks on question 4.
    const { marks: _marks, ...noMarks } = VALID

    expect(() => parseGeneratedQuestions(json([noMarks]), BRIEF)).toThrow(
      /marks: expected an integer/
    )
  })

  it('names the question a bad field belongs to', () => {
    expect(() =>
      parseGeneratedQuestions(json([VALID, { ...VALID, text: '' }]), BRIEF)
    ).toThrow(/question 2 of topic 3: text/)
  })

  it('rejects a difficulty outside the three bands', () => {
    expect(() =>
      parseGeneratedQuestions(json([{ ...VALID, difficulty: 'easy' }]), BRIEF)
    ).toThrow(/difficulty must be one of low, moderate, high/)
  })

  it('rejects fractional marks', () => {
    expect(() =>
      parseGeneratedQuestions(json([{ ...VALID, marks: 2.5 }]), BRIEF)
    ).toThrow(/expected an integer/)
  })

  it('rejects a response with no questions array', () => {
    expect(() => parseGeneratedQuestions('{"data":[]}', BRIEF)).toThrow(
      /questions: expected an array/
    )
  })

  it('accepts an empty question list rather than inventing one', () => {
    expect(parseGeneratedQuestions(json([]), BRIEF)).toEqual([])
  })

  it('keeps a diagram brief and drops an empty one', () => {
    const [withBrief] = parseGeneratedQuestions(
      json([
        {
          ...VALID,
          requiresDiagram: true,
          diagramBrief: 'A ray entering glass.',
        },
      ]),
      BRIEF
    )
    const [withoutBrief] = parseGeneratedQuestions(
      json([{ ...VALID, diagramBrief: '   ' }]),
      BRIEF
    )

    expect(withBrief.diagramBrief).toBe('A ray entering glass.')
    expect(withoutBrief.diagramBrief).toBeUndefined()
  })
})
