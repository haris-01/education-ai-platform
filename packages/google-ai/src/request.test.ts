import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestGoogleAi } from './request'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function quotaResponse(retryDelay?: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 429,
        message: 'Quota exceeded',
        details: retryDelay
          ? [
              {
                '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                retryDelay,
              },
            ]
          : [],
      },
    }),
    { status: 429 }
  )
}

const REQUEST = {
  path: 'models/test:generate',
  apiKey: 'k',
  body: { hello: 'world' },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// The waits are real setTimeout calls, so anything exercising them runs
// on fake timers. The settled/unsettled dance is not decoration: the
// work has already started, so a rejection landing while the timers are
// still draining would be an unhandled rejection.
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

describe('requestGoogleAi', () => {
  it('posts the body with the api key as a header', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(jsonResponse({ ok: 1 }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestGoogleAi<{ ok: number }>(REQUEST)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/test:generate'
    )
    expect(init.headers as Record<string, string>).toMatchObject({
      'x-goog-api-key': 'k',
    })
    expect(JSON.parse(String(init.body))).toEqual({ hello: 'world' })
    expect(result).toEqual({ ok: 1 })
  })

  it('waits the delay a 429 asks for, then retries', async () => {
    // The free tier allows 100 requests a minute and counts each item
    // in a batch as one, so a corpus larger than that must wait. The
    // body carries the wait the server wants; guessing it is how the
    // first attempt at this failed.
    const waits: { reason: string; ms: number }[] = []
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(quotaResponse('2s'))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    vi.useFakeTimers()
    await withoutWaiting(
      requestGoogleAi({
        ...REQUEST,
        onWait: (reason, ms) => waits.push({ reason, ms }),
      })
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 2s from RetryInfo, plus a second of headroom.
    expect(waits[0].ms).toBe(3000)
    expect(waits[0].reason).toContain('quota reached, attempt 1')
  })

  it('falls back to a fixed wait when a 429 carries no RetryInfo', async () => {
    const waits: number[] = []
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('not json', { status: 429 }))
        .mockResolvedValueOnce(jsonResponse({ ok: 1 }))
    )

    vi.useFakeTimers()
    await withoutWaiting(
      requestGoogleAi({ ...REQUEST, onWait: (_r, ms) => waits.push(ms) })
    )

    expect(waits).toEqual([30_000])
  })

  it('gives up on a budget of waiting, not a count of retries', async () => {
    // A count is the wrong shape: five retries is five minutes of
    // patience when the waits are a minute each, so whether it sufficed
    // depended on what else had been running.
    const waits: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(quotaResponse('59s')))
    )

    vi.useFakeTimers()
    await expect(
      withoutWaiting(
        requestGoogleAi({
          ...REQUEST,
          quotaBudgetMs: 60_000,
          onWait: (_r, ms) => waits.push(ms),
        })
      )
    ).rejects.toThrow('quota not cleared within 1 minutes')

    // One wait fits the budget; a second would exceed it.
    expect(waits).toEqual([60_000])
  })

  it('retries a dropped connection with a short backoff', async () => {
    // A long run holds connections open across minutes of pacing.
    // Losing one at minute three is not a reason to throw the run away
    // — and it is a different failure from a quota rejection, so it
    // gets a different wait.
    const waits: { reason: string; ms: number }[] = []
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new TypeError('fetch failed'), {
          cause: Object.assign(new Error('read ECONNRESET'), {
            code: 'ECONNRESET',
          }),
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    vi.useFakeTimers()
    await withoutWaiting(
      requestGoogleAi({
        ...REQUEST,
        onWait: (reason, ms) => waits.push({ reason, ms }),
      })
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(waits).toEqual([{ reason: 'connection lost, retry 1/3', ms: 2000 }])
  })

  it('rethrows the network error rather than reporting a quota problem', async () => {
    const failure = new TypeError('fetch failed')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(failure))
    )

    vi.useFakeTimers()
    await expect(
      withoutWaiting(requestGoogleAi({ ...REQUEST, onWait: () => undefined }))
    ).rejects.toThrow('fetch failed')
  })

  it('retries a 503, because "high demand" is the server saying not now', async () => {
    // Previously fatal to a whole paper. A well-formed request refused
    // for load is a transport condition wearing an HTTP status:
    // resending it unchanged is the correct response.
    const waits: string[] = []
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: 'high demand' } }, 503)
      )
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    vi.useFakeTimers()
    const result = await withoutWaiting(
      requestGoogleAi({ ...REQUEST, onWait: (reason) => waits.push(reason) })
    )

    expect(result).toEqual({ ok: 1 })
    expect(waits).toEqual(['service returned 503, retry 1/4'])
  })

  it('gives up on a 503 that will not clear, saying what it saw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ error: { message: 'high demand' } }, 503)
        )
      )
    )

    vi.useFakeTimers()
    await expect(
      withoutWaiting(requestGoogleAi({ ...REQUEST, onWait: () => undefined }))
    ).rejects.toThrow(/still returning 503 after 4 retries.*high demand/s)
  })

  it('does not retry a 4xx, which would fail the same way forever', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: { message: 'bad request' } }, 400))
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestGoogleAi(REQUEST)).rejects.toThrow(/400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a non-429 error with its body, not just a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ error: { message: 'model not found' } }, 404)
        )
      )
    )

    await expect(requestGoogleAi(REQUEST)).rejects.toThrow(
      /404.*model not found/s
    )
  })

  it('reports what a successful call cost', async () => {
    const reports: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            ok: 1,
            usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80 },
          })
        )
      )
    )

    await requestGoogleAi({ ...REQUEST, onCall: (r) => reports.push(r) })

    expect(reports[0]).toMatchObject({
      path: 'models/test:generate',
      outcome: 'ok',
      statusCode: 200,
      waitedMs: 0,
      attempts: 1,
      inputTokens: 120,
      outputTokens: 80,
    })
  })

  it('leaves tokens absent rather than zero when the API reports none', async () => {
    // batchEmbedContents reports no usage. A cost report that treats
    // unknown as zero is worse than one that says it does not know.
    const reports: { inputTokens?: number }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ embeddings: [] })))
    )

    await requestGoogleAi({ ...REQUEST, onCall: (r) => reports.push(r) })

    expect(reports[0].inputTokens).toBeUndefined()
  })

  it('separates time spent waiting from time spent working', async () => {
    // "Slow model" and "rate limited" are invisible in a total and
    // call for opposite responses.
    const reports: { waitedMs: number; attempts: number }[] = []
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(quotaResponse('2s'))
        .mockResolvedValueOnce(jsonResponse({ ok: 1 }))
    )

    vi.useFakeTimers()
    await withoutWaiting(
      requestGoogleAi({
        ...REQUEST,
        onWait: () => undefined,
        onCall: (r) => reports.push(r),
      })
    )

    expect(reports[0].waitedMs).toBe(3000)
    expect(reports[0].attempts).toBe(2)
  })

  it('reports a failed call, and why it failed', async () => {
    const reports: { outcome: string; attempts: number }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(quotaResponse('59s')))
    )

    vi.useFakeTimers()
    await expect(
      withoutWaiting(
        requestGoogleAi({
          ...REQUEST,
          quotaBudgetMs: 60_000,
          onWait: () => undefined,
          onCall: (r) => reports.push(r),
        })
      )
    ).rejects.toThrow()

    expect(reports[0].outcome).toBe('quota')
    expect(reports[0].attempts).toBeGreaterThan(1)
  })

  it('refuses to run without a key', async () => {
    await expect(requestGoogleAi({ ...REQUEST, apiKey: '' })).rejects.toThrow(
      'apiKey is required'
    )
  })
})
