import { requestGoogleAi } from '@education-ai/google-ai'
import type { GoogleAiRequestOptions } from '@education-ai/google-ai'

import type { GeneratedQuestion } from '../types/generated-paper'
import type { QuestionGenerator, TopicBrief } from '../types/generator'
import { buildGenerationPrompt } from '../prompt/build-generation-prompt'
import { parseGeneratedQuestions } from './parse-generated-questions'
import { QUESTION_RESPONSE_SCHEMA } from './response-schema'

// Checked against the account's own model list rather than assumed —
// names move, and a wrong one fails with a 404 rather than anything
// subtle. Flash rather than Pro: question generation is a short,
// heavily-constrained output where the schema does most of the work,
// and a paper is six calls, so the cheaper model is the right default.
// Override per caller when a topic needs more.
const DEFAULT_MODEL = 'gemini-3.5-flash'

export interface GeminiGeneratorOptions {
  apiKey: string

  model?: string

  quotaBudgetMs?: number

  onWait?: (reason: string, ms: number) => void

  // Reported once per request, for cost and rate-limit tracking. What
  // the call was *for* is only known where it was made, so the caller
  // adds that; this just passes the transport's report through.
  onCall?: GoogleAiRequestOptions['onCall']
}

interface GenerateContentResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
}

// Writes questions with Gemini, one topic per call, using the API's
// structured-output mode.
//
// A schema rather than "reply with JSON" in the prompt. Asking a model
// to produce JSON in prose gets JSON most of the time, and the rest of
// the time gets JSON wrapped in an apology — and the failure arrives as
// a parse error at the end of a paid call. A response schema makes the
// shape the API's problem rather than the prompt's.
//
// The output is still parsed and checked rather than trusted: a schema
// guarantees shape, not sense. Nothing stops a model returning three
// questions when four were asked for, or marks that do not sum.
// `validatePaper` catches that downstream; this catches the shape.
export function createGeminiGenerator(
  options: GeminiGeneratorOptions
): QuestionGenerator {
  const model = options.model ?? DEFAULT_MODEL

  if (!options.apiKey) {
    throw new Error(
      'createGeminiGenerator: apiKey is required. Set GEMINI_API_KEY — see .env.example.'
    )
  }

  return {
    model,
    generateTopic: async (brief: TopicBrief): Promise<GeneratedQuestion[]> => {
      if (brief.questionCount <= 0) {
        return []
      }

      const response = await requestGoogleAi<GenerateContentResponse>({
        path: `models/${model}:generateContent`,
        apiKey: options.apiKey,
        quotaBudgetMs: options.quotaBudgetMs,
        onWait: options.onWait,
        onCall: options.onCall,
        body: {
          contents: [
            { role: 'user', parts: [{ text: buildGenerationPrompt(brief) }] },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: QUESTION_RESPONSE_SCHEMA,
            // Some variety is wanted — a generator at zero produces the
            // same question for the same topic every run, which is the
            // opposite of what a paper generator is for. Not so much
            // that it stops following the brief.
            temperature: 0.7,
          },
        },
      })

      return parseGeneratedQuestions(readText(response), brief)
    },
  }
}

// A truncated response is the failure worth naming separately: it
// arrives as valid JSON that happens to be missing questions, and
// without this it would surface as "the model ignored the brief".
function readText(response: GenerateContentResponse): string {
  const candidate = response.candidates?.[0]

  if (!candidate) {
    throw new Error('Gemini returned no candidates')
  }

  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(
      `Gemini stopped early: ${candidate.finishReason}. The response is incomplete, not merely wrong.`
    )
  }

  const text = candidate.content?.parts?.[0]?.text

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Gemini returned an empty response')
  }

  return text
}
