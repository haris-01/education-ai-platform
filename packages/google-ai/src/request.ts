const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// A budget of total waiting, not a retry count.
//
// A count is the wrong shape for a quota: five retries is five minutes
// of patience when the waits are a minute each, and whether that is
// enough depends on what else has been running — which makes a job fail
// intermittently rather than deterministically. Both the things calling
// this are batch jobs, and a batch job can afford to wait. What it
// cannot afford is to stop early and leave half its work done.
const DEFAULT_QUOTA_BUDGET_MS = 20 * 60_000

// Used only when a 429 arrives without the RetryInfo it normally
// carries.
const FALLBACK_RETRY_MS = 30_000

// A dropped connection is a different failure from a quota rejection
// and wants a different answer: retry soon, not in a minute. A long run
// holds connections open for minutes at a time, and losing one after
// four minutes of pacing is not a reason to throw the run away.
const MAX_TRANSPORT_RETRIES = 3

const TRANSPORT_RETRY_MS = 2_000

// 503 UNAVAILABLE ("this model is currently experiencing high demand")
// is the one that prompted this: a shared model under load, temporary
// by the server's own description, and previously fatal to a whole
// paper. These are the server saying "not now", which is a transport
// condition wearing an HTTP status — the request was well-formed and
// resending it unchanged is the correct response. A 4xx is the
// opposite: resending it produces the same error forever.
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504])

// Longer than a dropped connection's backoff and growing, because
// "high demand" does not clear in two seconds. Still far shorter than a
// quota wait, which is a fixed window rather than a queue.
const OVERLOAD_RETRY_MS = 5_000

const MAX_OVERLOAD_RETRIES = 4

// What one call to the API cost, in the terms that matter
// operationally: time, tokens, and how much of the time was spent
// waiting rather than working.
//
// Reported through a callback rather than written anywhere by this
// package. Transport has no business knowing about a database, and
// keeping it that way means the telemetry sink can be swapped, or
// absent, without touching the code that makes the calls.
export interface GoogleAiCallReport {
  path: string

  // 'ok', or why it did not succeed.
  outcome: 'ok' | 'quota' | 'overload' | 'transport' | 'error'

  statusCode?: number

  // Wall clock for the whole call, including every retry and wait.
  durationMs: number

  // How much of that was spent waiting out quota or overload. The
  // difference between "slow model" and "rate limited" is invisible in
  // a total, and they call for opposite responses.
  waitedMs: number

  attempts: number

  // From the API's own usage metadata when it reports any.
  inputTokens?: number

  outputTokens?: number
}

export interface GoogleAiRequestOptions {
  // e.g. "models/gemini-embedding-001:batchEmbedContents"
  path: string

  apiKey: string

  body: unknown

  quotaBudgetMs?: number

  // Called before each wait, so a long run can say why it is idle
  // instead of looking hung.
  onWait?: (reason: string, ms: number) => void

  // Called once per request, whether it succeeded or not.
  onCall?: (report: GoogleAiCallReport) => void
}

interface Attempts {
  quota: number
  transport: number
  overload: number
  quotaWaitedMs: number
}

// One JSON POST to Google's Generative Language API, with the retry
// behaviour its quota actually needs.
//
// No SDK: the request is one POST, and every dependency added here is
// dependency surface in a project that has already had one
// supply-chain incident. It also does not use a generic HTTP retry
// helper, which was the first attempt and was wrong — those throw on
// any non-2xx and discard the body, and the body is exactly where this
// API puts what you need. A 429 carries a `RetryInfo` naming the delay
// it wants; retrying on a fixed backoff just spends the attempts.
export async function requestGoogleAi<T>(
  options: GoogleAiRequestOptions
): Promise<T> {
  if (!options.apiKey) {
    throw new Error(
      'requestGoogleAi: apiKey is required. Set GEMINI_API_KEY — see .env.example.'
    )
  }

  const startedAt = Date.now()
  const attempts: Attempts = {
    quota: 1,
    transport: 1,
    overload: 1,
    quotaWaitedMs: 0,
  }

  try {
    const result = await attempt<T>(options, attempts)

    options.onCall?.({
      path: options.path,
      outcome: 'ok',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      waitedMs: attempts.quotaWaitedMs,
      attempts: attempts.quota + attempts.overload + attempts.transport - 2,
      ...readUsage(result),
    })

    return result
  } catch (error) {
    options.onCall?.({
      path: options.path,
      outcome: classify(error),
      durationMs: Date.now() - startedAt,
      waitedMs: attempts.quotaWaitedMs,
      attempts: attempts.quota + attempts.overload + attempts.transport - 2,
    })

    throw error
  }
}

// `attempt` mutates nothing, so the counters it recursed with are not
// visible here — the shared object is updated as it goes precisely so
// a failed call can still report how hard it tried.
function classify(error: unknown): GoogleAiCallReport['outcome'] {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('quota not cleared')) {
    return 'quota'
  }

  if (message.includes('still returning 5')) {
    return 'overload'
  }

  if (message.includes('fetch failed')) {
    return 'transport'
  }

  return 'error'
}

// Google reports usage on generateContent and not on
// batchEmbedContents, so this is best-effort by design: absent token
// counts are absent, not zero, and a cost report that quietly treats
// them as zero is worse than one that says it does not know.
function readUsage(result: unknown): {
  inputTokens?: number
  outputTokens?: number
} {
  if (typeof result !== 'object' || result === null) {
    return {}
  }

  const usage = (result as { usageMetadata?: unknown }).usageMetadata

  if (typeof usage !== 'object' || usage === null) {
    return {}
  }

  const record = usage as Record<string, unknown>

  return {
    inputTokens:
      typeof record.promptTokenCount === 'number'
        ? record.promptTokenCount
        : undefined,
    outputTokens:
      typeof record.candidatesTokenCount === 'number'
        ? record.candidatesTokenCount
        : undefined,
  }
}

async function attempt<T>(
  options: GoogleAiRequestOptions,
  attempts: Attempts
): Promise<T> {
  const budget = options.quotaBudgetMs ?? DEFAULT_QUOTA_BUDGET_MS
  const response = await post(options, attempts)

  // A dropped connection rather than an answer. Retry the same request.
  if (!response) {
    await pause(
      TRANSPORT_RETRY_MS * attempts.transport,
      `connection lost, retry ${attempts.transport}/${MAX_TRANSPORT_RETRIES}`,
      options.onWait
    )

    attempts.transport += 1
    return attempt<T>(options, attempts)
  }

  if (response.status === 429) {
    const body = await response.text()
    const delay = readRetryDelayMs(body)

    if (attempts.quotaWaitedMs + delay > budget) {
      throw new Error(
        `Google AI quota not cleared within ${Math.round(budget / 60_000)} minutes ` +
          `(${attempts.quota} attempts, ${Math.round(attempts.quotaWaitedMs / 1000)}s waited). ` +
          'The free tier allows 100 requests per minute and counts each ' +
          'item in a batch as one. Raise quotaBudgetMs, or wait.'
      )
    }

    await pause(
      delay,
      `quota reached, attempt ${attempts.quota}, ` +
        `${Math.round(attempts.quotaWaitedMs / 1000)}s of ${Math.round(budget / 1000)}s budget used`,
      options.onWait
    )

    attempts.quota += 1
    attempts.quotaWaitedMs += delay
    return attempt<T>(options, attempts)
  }

  if (RETRYABLE_STATUSES.has(response.status)) {
    const body = await response.text()

    if (attempts.overload > MAX_OVERLOAD_RETRIES) {
      throw new Error(
        `Google AI still returning ${response.status} after ${MAX_OVERLOAD_RETRIES} retries: ${body.slice(0, 300)}`
      )
    }

    await pause(
      OVERLOAD_RETRY_MS * attempts.overload,
      `service returned ${response.status}, retry ${attempts.overload}/${MAX_OVERLOAD_RETRIES}`,
      options.onWait
    )

    attempts.overload += 1
    return attempt<T>(options, attempts)
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Google AI returned ${response.status}: ${body.slice(0, 500)}`
    )
  }

  return (await response.json()) as T
}

// Returns undefined when the connection failed rather than answered, so
// the caller can tell a transport failure from an HTTP one. After the
// last retry the original error is rethrown, because a network that is
// genuinely down should say so rather than surface as a quota message.
async function post(
  options: GoogleAiRequestOptions,
  attempts: Attempts
): Promise<Response | undefined> {
  try {
    return await fetch(`${API_BASE}/${options.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(options.body),
    })
  } catch (error) {
    if (attempts.transport >= MAX_TRANSPORT_RETRIES) {
      throw error
    }

    return undefined
  }
}

async function pause(
  ms: number,
  reason: string,
  onWait: GoogleAiRequestOptions['onWait']
): Promise<void> {
  if (ms <= 0) {
    return
  }

  onWait?.(reason, ms)
  await new Promise((resolve) => setTimeout(resolve, ms))
}

// A 429 body carries `RetryInfo` with the wait the server wants.
// Reading it is the difference between backing off correctly and
// guessing.
function readRetryDelayMs(body: string): number {
  try {
    const parsed: unknown = JSON.parse(body)
    const retryInfo = readDetails(parsed).find(
      (detail) => detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
    )
    const delay = retryInfo?.retryDelay

    if (typeof delay !== 'string') {
      return FALLBACK_RETRY_MS
    }

    const seconds = Number(delay.replace(/s$/, ''))

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return FALLBACK_RETRY_MS
    }

    // A second of headroom: the server's delay clears the quota window
    // exactly, and arriving exactly on it tends to 429 again.
    return Math.ceil(seconds * 1000) + 1000
  } catch {
    return FALLBACK_RETRY_MS
  }
}

function readDetails(parsed: unknown): Record<string, unknown>[] {
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
    return []
  }

  const { error } = parsed as { error: unknown }

  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return []
  }

  const { details } = error as { details: unknown }

  if (!Array.isArray(details)) {
    return []
  }

  return details.filter(
    (detail): detail is Record<string, unknown> =>
      typeof detail === 'object' && detail !== null
  )
}
