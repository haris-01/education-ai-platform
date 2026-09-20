import type { DiagramBrief } from '../types/diagram'

// Turns a figure brief into the instruction a model answers with SVG.
//
// A pure function so it can be asserted on: that the constraints which
// keep the output embeddable are present, and that they cannot be
// edited away unnoticed.
export function buildDiagramPrompt(brief: DiagramBrief): string {
  return [
    `Draw an examination figure labelled "${brief.label}" as a single SVG.`,
    '',
    'The figure must show:',
    brief.brief,
    '',
    'Rules:',
    '- Reply with the SVG only. No explanation, no markdown fence.',
    '- One root <svg> element with a viewBox. Do not set width or height attributes.',
    // Everything below keeps the output inside the validator's
    // allowlist. A diagram that fails validation is thrown away, so the
    // constraints are stated rather than hoped for.
    '- Use only: g, defs, marker, line, polyline, polygon, path, rect, circle, ellipse, text, tspan.',
    '- No script, no style blocks, no foreignObject, no images, no external references, no XML entities.',
    '- Black strokes on no fill unless the physics needs otherwise. This is printed in monochrome.',
    '- Label every component, axis and quantity with <text>, including units.',
    '- Use font-family Helvetica and font-size between 10 and 14 so labels stay readable at A4.',
    '- Keep it to the size of a figure in a question paper: roughly 400 by 240 user units.',
    '- Draw what is stated and nothing more. An exam figure that shows extra detail gives away the answer.',
  ].join('\n')
}
