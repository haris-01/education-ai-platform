import type { Diagram, DiagramGenerator } from '../types/diagram'

export interface DiagramRequest {
  questionNumber: number

  brief: string
}

export interface PaperDiagrams {
  // Keyed by question number. A question whose figure could not be
  // drawn is simply absent, and named in `failures`.
  byQuestion: Map<number, Diagram>

  failures: { questionNumber: number; reason: string }[]
}

// Draws every figure a paper asks for.
//
// Failures are isolated per question and reported, never thrown. One
// rejected SVG out of eleven should not lose the other ten — they cost
// a model call each — and the caller needs to know precisely which
// questions are unillustrated to decide whether to ship, retry, or
// regenerate those questions without figures.
export async function generatePaperDiagrams(
  requests: DiagramRequest[],
  generator: DiagramGenerator
): Promise<PaperDiagrams> {
  const results = await Promise.all(
    requests.map((request) => draw(request, generator))
  )

  return {
    byQuestion: new Map(
      results.flatMap((result) =>
        result.ok ? [[result.questionNumber, result.diagram] as const] : []
      )
    ),
    failures: results.flatMap((result) =>
      result.ok
        ? []
        : [{ questionNumber: result.questionNumber, reason: result.reason }]
    ),
  }
}

type DrawResult =
  | { ok: true; questionNumber: number; diagram: Diagram }
  | { ok: false; questionNumber: number; reason: string }

async function draw(
  request: DiagramRequest,
  generator: DiagramGenerator
): Promise<DrawResult> {
  try {
    const diagram = await generator.generate({
      label: `Fig. ${request.questionNumber}.1`,
      brief: request.brief,
    })

    return { ok: true, questionNumber: request.questionNumber, diagram }
  } catch (error) {
    return {
      ok: false,
      questionNumber: request.questionNumber,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
