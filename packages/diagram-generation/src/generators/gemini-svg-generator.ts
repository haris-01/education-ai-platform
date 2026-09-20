import { requestGoogleAi } from '@education-ai/google-ai'
import type { GoogleAiRequestOptions } from '@education-ai/google-ai'

import type { Diagram, DiagramBrief, DiagramGenerator } from '../types/diagram'
import { buildDiagramPrompt } from '../pipeline/build-diagram-prompt'
import { validateSvg } from '../validation/validate-svg'

const DEFAULT_MODEL = 'gemini-3.5-flash'

export interface GeminiSvgGeneratorOptions {
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

// Draws an exam figure by asking a text model to write SVG.
//
// Not an image model, though several are available. An exam diagram is
// a technical drawing — a ray meeting a boundary at a stated angle,
// a circuit with named components, axes with units — and it has to
// survive being printed at A4 and read. An image model produces
// something that looks like a circuit; writing SVG produces a circuit,
// with real text labels, exact geometry, and a source that can be
// inspected and corrected rather than regenerated and hoped over.
export function createGeminiSvgGenerator(
  options: GeminiSvgGeneratorOptions
): DiagramGenerator {
  const model = options.model ?? DEFAULT_MODEL

  if (!options.apiKey) {
    throw new Error(
      'createGeminiSvgGenerator: apiKey is required. Set GEMINI_API_KEY — see .env.example.'
    )
  }

  return {
    model,
    generate: async (brief: DiagramBrief): Promise<Diagram> => {
      const response = await requestGoogleAi<GenerateContentResponse>({
        path: `models/${model}:generateContent`,
        apiKey: options.apiKey,
        quotaBudgetMs: options.quotaBudgetMs,
        onWait: options.onWait,
        onCall: options.onCall,
        body: {
          contents: [
            { role: 'user', parts: [{ text: buildDiagramPrompt(brief) }] },
          ],
          // Lower than question generation. A diagram has a right
          // answer in a way a question does not: a ray diagram either
          // shows refraction toward the normal or it is wrong.
          generationConfig: { temperature: 0.2 },
        },
      })

      const svg = extractSvg(readText(response))
      const validation = validateSvg(svg)

      // Rejected rather than sanitised. A diagram quietly stripped of
      // half its content still reaches a candidate looking complete,
      // and an unanswerable question is worse than a missing figure.
      if (!validation.valid) {
        throw new Error(
          `Generated SVG was rejected: ${validation.reasons.join(' ')}`
        )
      }

      return {
        label: brief.label,
        svg,
        width: validation.width ?? 400,
        height: validation.height ?? 240,
      }
    },
  }
}

// Models wrap code in fences even when told not to, so the fence is
// removed rather than treated as a failure — it is a formatting habit,
// not a wrong answer.
function extractSvg(text: string): string {
  const fenced = text.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? text).trim()
  const start = body.search(/<svg[\s>]/i)
  const end = body.toLowerCase().lastIndexOf('</svg>')

  if (start === -1 || end === -1) {
    return body
  }

  return body.slice(start, end + '</svg>'.length)
}

function readText(response: GenerateContentResponse): string {
  const candidate = response.candidates?.[0]

  if (!candidate) {
    throw new Error('Gemini returned no candidates for the diagram')
  }

  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(
      `Gemini stopped early drawing the diagram: ${candidate.finishReason}`
    )
  }

  const text = candidate.content?.parts?.[0]?.text

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Gemini returned an empty diagram')
  }

  return text
}
