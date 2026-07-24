import { createLogger } from './logger.js'

const logger = createLogger('http')

// A realistic browser UA avoids being blocked by basic bot filtering on
// exam board sites, which tend to be server-rendered but still check this header.
const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
}

export interface FetchWithRetryOptions {
  retries?: number
  retryDelayMs?: number
}

/**
 * Fetches a URL with retries on transient failures (network errors or
 * non-2xx responses). Shared by every stage that talks to the network
 * (subject/section page fetches, and binary file downloads).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  { retries = 3, retryDelayMs = 500 }: FetchWithRetryOptions = {}
): Promise<Response> {
  let lastError: unknown

  // A retry-with-backoff loop is control flow, not data transformation — each
  // attempt depends on the previous one failing and waits before the next,
  // which doesn't map cleanly onto map/reduce.
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...DEFAULT_HEADERS, ...init.headers },
      })

      if (!response.ok) {
        throw new Error(
          `Request to ${url} failed with status ${response.status}`
        )
      }

      return response
    } catch (error) {
      lastError = error
      logger.warn(
        `Attempt ${attempt}/${retries} failed for ${url}: ${(error as Error).message}`
      )

      if (attempt < retries) {
        await delay(retryDelayMs * attempt)
      }
    }
  }

  throw new Error(
    `Failed to fetch ${url} after ${retries} attempts: ${(lastError as Error).message}`
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
