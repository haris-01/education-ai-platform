// Elements an exam diagram legitimately needs. Everything else is
// rejected rather than stripped: a diagram that silently loses half
// its content is worse than one that fails loudly, because it reaches
// a candidate looking complete.
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'title',
  'desc',
  'line',
  'polyline',
  'polygon',
  'path',
  'rect',
  'circle',
  'ellipse',
  'text',
  'tspan',
])

// `on*` handlers are excluded by the prefix check below rather than
// listed here.
const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'viewbox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'dx',
  'dy',
  'marker-end',
  'marker-start',
  'markerwidth',
  'markerheight',
  'markerunits',
  'refx',
  'refy',
  'orient',
  'xmlns',
  'version',
])

const MAX_SVG_BYTES = 120_000

export interface SvgValidation {
  valid: boolean

  reasons: string[]

  width?: number

  height?: number
}

// Checks that generated SVG is safe to embed and shaped like a figure.
//
// Safety first, and not theoretically: this is markup written by a
// model, from a prompt that includes retrieved text, embedded into a
// document a school will open. `<script>`, event handlers,
// `<foreignObject>` and any external reference are how an SVG stops
// being a picture. They are rejected, not sanitised away.
//
// Parsed with a regex scan rather than an XML parser, deliberately: the
// alternative is another dependency for one job, and the check here is
// an allowlist over tag and attribute names, which is exactly what a
// scan can do reliably. It cannot validate nesting — `validateSvg` is a
// gate against dangerous content and obvious malformation, and pdfkit
// is the thing that ultimately has to parse it.
export function validateSvg(svg: string): SvgValidation {
  const reasons = [
    ...checkSize(svg),
    ...checkRoot(svg),
    ...checkElements(svg),
    ...checkAttributes(svg),
    ...checkExternalReferences(svg),
  ]

  const box = readViewBox(svg)

  if (!box) {
    reasons.push('The <svg> element has no usable viewBox.')
  }

  return {
    valid: reasons.length === 0,
    reasons,
    width: box?.width,
    height: box?.height,
  }
}

function checkSize(svg: string): string[] {
  if (svg.trim().length === 0) {
    return ['The SVG is empty.']
  }

  if (Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) {
    return [`The SVG is larger than ${MAX_SVG_BYTES} bytes.`]
  }

  return []
}

function checkRoot(svg: string): string[] {
  if (!/^\s*<svg[\s>]/i.test(svg)) {
    return ['The SVG must start with an <svg> element.']
  }

  return []
}

function checkElements(svg: string): string[] {
  const used = [...svg.matchAll(/<\s*([a-zA-Z][\w:-]*)/g)].map((match) =>
    match[1].toLowerCase()
  )

  const disallowed = [...new Set(used)].filter(
    (name) => !ALLOWED_ELEMENTS.has(name)
  )

  if (disallowed.length === 0) {
    return []
  }

  return [`Elements not allowed in a diagram: ${disallowed.join(', ')}.`]
}

function checkAttributes(svg: string): string[] {
  const used = [...svg.matchAll(/\s([a-zA-Z][\w:-]*)\s*=/g)].map((match) =>
    match[1].toLowerCase()
  )

  const disallowed = [...new Set(used)].filter(
    (name) => !ALLOWED_ATTRIBUTES.has(name)
  )

  if (disallowed.length === 0) {
    return []
  }

  return [`Attributes not allowed in a diagram: ${disallowed.join(', ')}.`]
}

// Even inside allowed attributes, a URL can fetch or execute. A
// diagram is self-contained by definition — anything reaching outside
// it is either a tracking pixel or worse.
function checkExternalReferences(svg: string): string[] {
  // The SVG namespace declaration is an http URL that is never
  // fetched — it is an identifier. Scanning the raw markup for "http"
  // flags every well-formed SVG ever written, which is how the first
  // version of this rejected its own fixtures.
  const scannable = svg.replace(/\sxmlns(:[\w-]+)?\s*=\s*["'][^"']*["']/gi, ' ')

  const patterns: [RegExp, string][] = [
    [/javascript:/i, 'a javascript: URL'],
    [/data:/i, 'a data: URL'],
    [/https?:\/\//i, 'an external http URL'],
    [/url\s*\(/i, 'a url() reference'],
    [/&[#a-zA-Z0-9]+;/, 'an XML entity'],
  ]

  return patterns.flatMap(([pattern, description]) =>
    pattern.test(scannable) ? [`The SVG contains ${description}.`] : []
  )
}

function readViewBox(
  svg: string
): { width: number; height: number } | undefined {
  const match = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i)

  if (!match) {
    return undefined
  }

  const parts = match[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number)

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return undefined
  }

  const [, , width, height] = parts

  if (width <= 0 || height <= 0) {
    return undefined
  }

  return { width, height }
}
