import { afterEach, describe, expect, it, vi } from 'vitest'

import { sourceHit } from '../test-fixtures'
import type { TopicBrief } from '../types/generator'
import { createGeminiGenerator } from './gemini-generator'

const BRIEF: TopicBrief = {
  syllabusCode: '0625',
  topicNumber: 3,
  topicName: 'Waves',
  questionCount: 1,
  marks: 6,
  objectives: [],
  exemplars: [sourceHit('chunk-a', 'an exemplar')],
  insights: [],
  multipleChoice: false,
}

const QUESTION = {
  text: 'Describe how light refracts entering glass.',
  marks: 6,
  assessmentObjective: 'AO1',
  difficulty: 'moderate',
  requiresDiagram: false,
  markScheme: [{ text: 'bends toward the normal', marks: 6 }],
}

function candidateResponse(body: unknown, finishReason = 'STOP'): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(body) }] }, finishReason },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGeminiGenerator', () => {
  it('asks for JSON against a schema, not JSON in prose', () => {
    // Asking a model for JSON in the prompt gets JSON most of the time,
    // and the rest of the time JSON wrapped in an apology — discovered
    // as a parse error at the end of a paid call.
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(candidateResponse({ questions: [QUESTION] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const generator = createGeminiGenerator({ apiKey: 'k' })

    return generator.generateTopic(BRIEF).then(() => {
      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
      expect(body.generationConfig.responseMimeType).toBe('application/json')
      expect(body.generationConfig.responseSchema.required).toEqual([
        'questions',
      ])
    })
  })

  it('sends the built prompt', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(candidateResponse({ questions: [QUESTION] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    await createGeminiGenerator({ apiKey: 'k' }).generateTopic(BRIEF)

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.contents[0].parts[0].text).toContain('Write NEW questions')
    expect(body.contents[0].parts[0].text).toContain('topic 3 (Waves)')
  })

  it('returns parsed, typed questions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(candidateResponse({ questions: [QUESTION] })))
    )

    const questions = await createGeminiGenerator({
      apiKey: 'k',
    }).generateTopic(BRIEF)

    expect(questions).toHaveLength(1)
    expect(questions[0].topicNumber).toBe(3)
    expect(questions[0].sourceChunkIds).toEqual(['chunk-a'])
  })

  it('reports a truncated response as incomplete, not as a bad answer', async () => {
    // It arrives as valid JSON that happens to be missing questions.
    // Without this it would surface as "the model ignored the brief".
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          candidateResponse({ questions: [QUESTION] }, 'MAX_TOKENS')
        )
      )
    )

    await expect(
      createGeminiGenerator({ apiKey: 'k' }).generateTopic(BRIEF)
    ).rejects.toThrow(/stopped early: MAX_TOKENS/)
  })

  it('reports an empty or candidate-less response clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ candidates: [] }), { status: 200 })
        )
      )
    )

    await expect(
      createGeminiGenerator({ apiKey: 'k' }).generateTopic(BRIEF)
    ).rejects.toThrow(/no candidates/)
  })

  it('does not call the API for a topic with no questions', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const questions = await createGeminiGenerator({
      apiKey: 'k',
    }).generateTopic({ ...BRIEF, questionCount: 0 })

    expect(questions).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to be constructed without a key', () => {
    expect(() => createGeminiGenerator({ apiKey: '' })).toThrow('apiKey')
  })
})
