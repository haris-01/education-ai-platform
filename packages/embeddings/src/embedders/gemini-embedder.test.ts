import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGeminiEmbedder } from './gemini-embedder'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(
  handler: (url: string, init: RequestInit) => Response
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init ?? {}))
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function readBody(init: RequestInit): {
  requests: {
    model: string
    content: { parts: { text: string }[] }
    taskType: string
    outputDimensionality: number
  }[]
} {
  return JSON.parse(String(init.body))
}

// Pacing is real time. Tests never reach a real quota, so they turn it
// off rather than sleeping through it.
const FAST = { requestsPerMinute: Number.POSITIVE_INFINITY }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// The waits are real setTimeout calls, so anything that exercises them
// runs on fake timers rather than sleeping through the test suite.
//
// The settled/unsettled dance is not decoration: the work has already
// started, so a rejection that lands while the timers are still draining
// would be an unhandled rejection. Turning it into a value first, and
// rethrowing after, keeps it attached.
async function withoutWaiting<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  )

  await vi.runAllTimersAsync()

  const result = await settled

  if (!result.ok) {
    throw result.error
  }

  return result.value
}

describe('createGeminiEmbedder', () => {
  it('sends the api key as a header and the text as content parts', async () => {
    const fetchMock = stubFetch((_url, init) =>
      jsonResponse({
        embeddings: readBody(init).requests.map(() => ({ values: [3, 4] })),
      })
    )

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'test-key',
      dimensions: 2,
    })
    await embedder.embed(['a trolley on a ramp'], 'document')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(
      '/models/gemini-embedding-001:batchEmbedContents'
    )
    expect(
      (init as RequestInit).headers as Record<string, string>
    ).toMatchObject({ 'x-goog-api-key': 'test-key' })
    expect(readBody(init as RequestInit).requests[0].content.parts).toEqual([
      { text: 'a trolley on a ramp' },
    ])
  })

  it('maps the task type to the api names, which is what makes retrieval work', async () => {
    const fetchMock = stubFetch((_url, init) =>
      jsonResponse({
        embeddings: readBody(init).requests.map(() => ({ values: [1, 0] })),
      })
    )

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
    })
    await embedder.embed(['x'], 'document')
    await embedder.embed(['x'], 'query')

    const taskTypes = fetchMock.mock.calls.map(
      ([, init]) => readBody(init as RequestInit).requests[0].taskType
    )
    expect(taskTypes).toEqual(['RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY'])
  })

  it('normalises what comes back, because truncated vectors are not unit length', async () => {
    stubFetch(() => jsonResponse({ embeddings: [{ values: [3, 4] }] }))

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
    })
    const [vector] = await embedder.embed(['x'], 'document')

    expect(vector[0]).toBeCloseTo(0.6, 10)
    expect(vector[1]).toBeCloseTo(0.8, 10)
  })

  it('requests the configured output dimensionality', async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ embeddings: [{ values: [1, 0, 0] }] })
    )

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 3,
    })
    await embedder.embed(['x'], 'document')

    expect(
      readBody(fetchMock.mock.calls[0][1] as RequestInit).requests[0]
        .outputDimensionality
    ).toBe(3)
  })

  it('splits more than one batch of inputs into separate calls', async () => {
    const fetchMock = stubFetch((_url, init) =>
      jsonResponse({
        embeddings: readBody(init).requests.map(() => ({ values: [1, 0] })),
      })
    )

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
    })
    const texts = Array.from({ length: 250 }, (_unused, i) => `chunk ${i}`)
    const vectors = await embedder.embed(texts, 'document')

    // 250 texts at the default batch size of 50.
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(vectors).toHaveLength(250)
    expect(vectors).toHaveLength(new Set(texts).size)
  })

  it('waits the delay a 429 asks for, then retries', async () => {
    // The free tier allows 100 embed requests per minute and counts each
    // text in a batch as one, so a corpus larger than that must wait.
    // The body carries the wait the server wants; guessing it is how the
    // first attempt at this failed.
    const waits = []
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 429,
              message: 'Quota exceeded',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                  retryDelay: '2s',
                },
              ],
            },
          }),
          { status: 429 }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ embeddings: [{ values: [1, 0] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
      onWait: (reason, ms) => waits.push({ reason, ms }),
    })

    vi.useFakeTimers()
    const vectors = await withoutWaiting(embedder.embed(['x'], 'document'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vectors).toHaveLength(1)
    expect(waits).toEqual([{ reason: 'quota reached, retry 1/5', ms: 3000 }])
  })

  it('falls back to a fixed wait when a 429 carries no RetryInfo', async () => {
    const waits = []
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not json at all', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ embeddings: [{ values: [1, 0] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
      onWait: (_reason, ms) => waits.push(ms),
    })

    vi.useFakeTimers()
    await withoutWaiting(embedder.embed(['x'], 'document'))

    expect(waits).toEqual([30_000])
  })

  it('gives up with an explanation rather than retrying a quota forever', async () => {
    const quota = new Response(
      JSON.stringify({ error: { code: 429, details: [] } }),
      { status: 429 }
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(quota.clone()))
    )

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
      onWait: () => undefined,
    })

    vi.useFakeTimers()
    await expect(
      withoutWaiting(embedder.embed(['x'], 'document'))
    ).rejects.toThrow('100 embed requests per minute')
  })

  it('paces between batches to stay under the quota', async () => {
    const waits: { reason: string; ms: number }[] = []
    stubFetch((_url, init) =>
      jsonResponse({
        embeddings: readBody(init).requests.map(() => ({ values: [1, 0] })),
      })
    )

    const embedder = createGeminiEmbedder({
      apiKey: 'k',
      dimensions: 2,
      batchSize: 10,
      requestsPerMinute: 100,
      onWait: (reason, ms) => waits.push({ reason, ms }),
    })

    vi.useFakeTimers()
    await withoutWaiting(
      embedder.embed(
        Array.from({ length: 30 }, (_u, i) => `chunk ${i}`),
        'document'
      )
    )

    // Three batches of 10, so two pauses. 10 of a 100/minute budget is
    // six seconds' worth. Nothing is waited before the first batch.
    expect(waits.map((w) => w.ms)).toEqual([6000, 6000])
    expect(waits[0].reason).toContain('100 requests/minute')
  })

  it('calls nothing for an empty input', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ embeddings: [] }))

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
    })

    expect(await embedder.embed([], 'document')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails loudly when the response shape is not what was expected', async () => {
    stubFetch(() => jsonResponse({ data: [] }))

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
    })

    await expect(embedder.embed(['x'], 'document')).rejects.toThrow(
      'no `embeddings` array'
    )
  })

  it('fails when the count does not match the inputs', async () => {
    stubFetch(() => jsonResponse({ embeddings: [{ values: [1, 0] }] }))

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
    })

    await expect(embedder.embed(['x', 'y'], 'document')).rejects.toThrow(
      '1 embeddings for 2 inputs'
    )
  })

  it('retries a dropped connection, which a long run will meet', async () => {
    // A 483-chunk run holds connections open across four minutes of
    // pacing. Losing one to an ECONNRESET at minute three is not a
    // reason to throw the run away — and this is a different failure
    // from a quota rejection, so it gets a different backoff.
    const waits: string[] = []
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('read ECONNRESET'), {
            code: 'ECONNRESET',
          }),
        })
      )
      .mockResolvedValueOnce(jsonResponse({ embeddings: [{ values: [1, 0] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
      onWait: (reason) => waits.push(reason),
    })

    vi.useFakeTimers()
    const vectors = await withoutWaiting(embedder.embed(['x'], 'document'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vectors).toHaveLength(1)
    expect(waits).toEqual(['connection lost, retry 1/3'])
  })

  it('rethrows the original network error rather than hiding it', async () => {
    // A network that is genuinely down should say ECONNRESET, not
    // report a quota problem it does not have.
    const failure = new TypeError('fetch failed')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(failure))
    )

    const embedder = createGeminiEmbedder({
      ...FAST,
      apiKey: 'k',
      dimensions: 2,
      onWait: () => undefined,
    })

    vi.useFakeTimers()
    await expect(
      withoutWaiting(embedder.embed(['x'], 'document'))
    ).rejects.toThrow('fetch failed')
  })

  it('refuses to be constructed without a key', () => {
    expect(() => createGeminiEmbedder({ apiKey: '' })).toThrow('apiKey')
  })
})
