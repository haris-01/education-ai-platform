import { describe, expect, it } from 'vitest'

import { splitSentences } from './sentences.js'

describe('splitSentences', () => {
  it('splits on full stops', () => {
    expect(splitSentences('One thing. Another thing.')).toEqual([
      'One thing.',
      'Another thing.',
    ])
  })

  it('splits on question and exclamation marks', () => {
    expect(splitSentences('Is it so? It is! Indeed.')).toEqual([
      'Is it so?',
      'It is!',
      'Indeed.',
    ])
  })

  it('keeps "Fig. 5.1" in one sentence', () => {
    const text = 'Candidates measured JK on Fig. 5.1 and stopped there.'
    expect(splitSentences(text)).toEqual([text])
  })

  it('keeps "e.g." in one sentence', () => {
    const text = 'A tangent in the wrong place, e.g. at t = 0, gained nothing.'
    expect(splitSentences(text)).toEqual([text])
  })

  it('collapses the ragged whitespace PDF extraction leaves', () => {
    expect(splitSentences('A   common\n\n error   was\tmade.')).toEqual([
      'A common error was made.',
    ])
  })

  it('returns nothing for empty or blank input', () => {
    expect(splitSentences('')).toEqual([])
    expect(splitSentences('   \n  ')).toEqual([])
  })

  it('keeps a trailing sentence with no final full stop', () => {
    expect(splitSentences('First one. Second one with no stop')).toEqual([
      'First one.',
      'Second one with no stop',
    ])
  })
})
