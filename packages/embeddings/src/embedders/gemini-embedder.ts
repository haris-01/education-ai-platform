import { requestGoogleAi } from '@education-ai/google-ai'
import type { GoogleAiRequestOptions } from '@education-ai/google-ai'

import type { EmbedTaskType, Embedder } from '../types/embedder'

const DEFAULT_MODEL = 'gemini-embedding-001'

// The endpoint accepts up to 100 contents in one call. Note what this
// does and does not buy: each content in a batch counts as one request
// against the quota, so batching saves round trips, not quota. 50 keeps
// the pause between batches short enough to watch, and makes a rejected
// batch cheap to redo.
const DEFAULT_BATCH_SIZE = 50

// Google AI Studio's free tier, measured from its own 429:
// EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier = 100.
const DEFAULT_REQUESTS_PER_MINUTE = 100

// pgvector's HNSW index refuses anything over 2000 dimensions, so the
// model's full 3072 would store but never index — every query would
// fall back to a sequential scan. 768 is a real choice, not a
// compromise: this model is Matryoshka-trained, so a truncated vector
// is a coherent smaller embedding rather than a damaged large one.
const DEFAULT_DIMENSIONS = 768

export interface GeminiEmbedderOptions {
  apiKey: string

  model?: string

  dimensions?: number

  batchSize?: number

  // Set high to disable pacing — tests do this, since they never reach
  // a real quota.
  requestsPerMinute?: number

  quotaBudgetMs?: number

  onWait?: (reason: string, ms: number) => void

  // Reported once per request, for cost and rate-limit tracking. What
  // the call was *for* is only known where it was made, so the caller
  // adds that; this just passes the transport's report through.
  onCall?: GoogleAiRequestOptions['onCall']
}

interface BatchResponse {
  embeddings?: unknown
}

export function createGeminiEmbedder(options: GeminiEmbedderOptions): Embedder {
  const model = options.model ?? DEFAULT_MODEL
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  const requestsPerMinute =
    options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE

  if (!options.apiKey) {
    throw new Error(
      'createGeminiEmbedder: apiKey is required. Set GEMINI_API_KEY — see .env.example.'
    )
  }

  return {
    model,
    dimensions,
    embed: async (texts, taskType) => {
      if (texts.length === 0) {
        return []
      }

      const batches = splitIntoBatches(texts, batchSize)

      // Sequential, and paced. Firing every batch at once is the
      // reliable way to be throttled, and the quota is per minute, so
      // the only way through a corpus larger than it is to go slower.
      return batches.reduce<Promise<number[][]>>(
        async (previous, batch, index) => {
          const done = await previous

          if (index > 0) {
            await pace(
              batchIntervalMs(batch.length, requestsPerMinute),
              `pacing to ${requestsPerMinute} requests/minute`,
              options.onWait
            )
          }

          const response = await requestGoogleAi<BatchResponse>({
            path: `models/${model}:batchEmbedContents`,
            apiKey: options.apiKey,
            quotaBudgetMs: options.quotaBudgetMs,
            onWait: options.onWait,
            onCall: options.onCall,
            body: {
              requests: batch.map((text) => ({
                model: `models/${model}`,
                content: { parts: [{ text }] },
                taskType: toApiTaskType(taskType),
                outputDimensionality: dimensions,
              })),
            },
          })

          const vectors = readEmbeddings(response)

          if (vectors.length !== batch.length) {
            throw new Error(
              `Gemini returned ${vectors.length} embeddings for ${batch.length} inputs`
            )
          }

          return [...done, ...vectors.map(normalise)]
        },
        Promise.resolve([])
      )
    },
  }
}

// A query and the document that should answer it are not the same kind
// of text, and this model is trained to place them accordingly. Getting
// this wrong is silent — retrieval simply gets worse — which is why the
// task type is a required argument rather than an option with a
// default.
function toApiTaskType(taskType: EmbedTaskType): string {
  if (taskType === 'query') {
    return 'RETRIEVAL_QUERY'
  }

  return 'RETRIEVAL_DOCUMENT'
}

// Only the full-width vectors come back normalised; a truncated
// Matryoshka vector does not — a 768-wide one measures about 0.59 long
// — and cosine distance over unnormalised vectors quietly ranks by
// magnitude as much as by direction. Doing it here means every Embedder
// in this package returns unit vectors, whatever produced them.
function normalise(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))

  if (magnitude === 0) {
    return vector
  }

  return vector.map((v) => v / magnitude)
}

function batchIntervalMs(
  batchLength: number,
  requestsPerMinute: number
): number {
  if (!Number.isFinite(requestsPerMinute) || requestsPerMinute <= 0) {
    return 0
  }

  return Math.ceil((batchLength / requestsPerMinute) * 60_000)
}

async function pace(
  ms: number,
  reason: string,
  onWait: GeminiEmbedderOptions['onWait']
): Promise<void> {
  if (ms <= 0) {
    return
  }

  onWait?.(reason, ms)
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function splitIntoBatches(texts: string[], size: number): string[][] {
  return Array.from({ length: Math.ceil(texts.length / size) }, (_unused, i) =>
    texts.slice(i * size, (i + 1) * size)
  )
}

// The response is parsed rather than cast: a shape change should fail
// here with a clear message instead of surfacing as NaN distances three
// layers down.
function readEmbeddings(body: BatchResponse): number[][] {
  const { embeddings } = body

  if (!Array.isArray(embeddings)) {
    throw new Error('Gemini response had no `embeddings` array')
  }

  return embeddings.map((entry, index) => {
    const values =
      typeof entry === 'object' && entry !== null && 'values' in entry
        ? (entry as { values: unknown }).values
        : undefined

    if (!Array.isArray(values) || values.some((v) => typeof v !== 'number')) {
      throw new Error(`Gemini embedding ${index} had no numeric \`values\``)
    }

    return values
  })
}
