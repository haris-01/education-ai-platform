import type { Diagram, DiagramBrief, DiagramGenerator } from '../types/diagram'

// A deterministic placeholder figure.
//
// Same role as the fake embedder and the fake generator: it draws
// nothing meaningful, but it always produces valid, safe SVG of a known
// size, so the PDF embedding, the validation gate and the whole
// pipeline can be tested with no key and no cost.
export function createFakeDiagramGenerator(): DiagramGenerator {
  return {
    model: 'fake-diagram-generator',
    generate: async (brief: DiagramBrief): Promise<Diagram> => ({
      label: brief.label,
      svg: placeholder(brief),
      width: 400,
      height: 240,
    }),
  }
}

function placeholder(brief: DiagramBrief): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">',
    '<rect x="1" y="1" width="398" height="238" fill="none" stroke="#333" stroke-width="1"/>',
    `<text x="200" y="120" text-anchor="middle" font-family="Helvetica" font-size="12">${escapeText(brief.label)}</text>`,
    '</svg>',
  ].join('')
}

// Text goes inside an element, so `<` and `&` would break the markup.
// Quotes are escaped as characters rather than entities because the
// validator rejects XML entities outright — an entity is a way to
// smuggle content past a scan, and a diagram never needs one.
function escapeText(text: string): string {
  return text.replace(/[<>&"']/g, ' ').slice(0, 60)
}
