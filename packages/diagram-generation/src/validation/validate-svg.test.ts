import { describe, expect, it } from 'vitest'

import { validateSvg } from './validate-svg'

const VALID = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">',
  '<line x1="10" y1="10" x2="390" y2="10" stroke="black" stroke-width="1"/>',
  '<text x="200" y="120" text-anchor="middle" font-family="Helvetica" font-size="12">Fig. 3.1</text>',
  '</svg>',
].join('')

describe('validateSvg', () => {
  it('accepts an exam figure and reads its size from the viewBox', () => {
    const result = validateSvg(VALID)

    expect(result.valid).toBe(true)
    expect(result.reasons).toEqual([])
    expect(result.width).toBe(400)
    expect(result.height).toBe(240)
  })

  it('rejects a script, however it is dressed up', () => {
    // This is markup written by a model, from a prompt containing
    // retrieved text, embedded in a document a school will open.
    const withScript = VALID.replace(
      '</svg>',
      '<script>alert(1)</script></svg>'
    )

    const result = validateSvg(withScript)

    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toContain('script')
  })

  it('rejects event handlers', () => {
    const withHandler = VALID.replace(
      '<line',
      '<line onload="alert(1)" onclick="alert(2)"'
    )

    expect(validateSvg(withHandler).valid).toBe(false)
  })

  it('rejects anything that reaches outside the figure', () => {
    // A self-contained picture never needs a URL. Anything that does
    // is a tracking pixel or worse.
    const cases = [
      VALID.replace('</svg>', '<image href="http://x/y.png"/></svg>'),
      VALID.replace('stroke="black"', 'stroke="url(#external)"'),
      VALID.replace('stroke="black"', 'stroke="data:image/png;base64,AAA"'),
      VALID.replace('>Fig. 3.1<', '>&xxe;<'),
    ]

    cases.forEach((svg) => {
      expect(validateSvg(svg).valid).toBe(false)
    })
  })

  it('rejects foreignObject, which is arbitrary HTML in a picture', () => {
    const withForeign = VALID.replace(
      '</svg>',
      '<foreignObject><div>hi</div></foreignObject></svg>'
    )

    expect(validateSvg(withForeign).valid).toBe(false)
  })

  it('rejects rather than strips, so nothing reaches a candidate half-drawn', () => {
    // A diagram quietly stripped of half its content still looks
    // complete on the page, and an unanswerable question is worse than
    // a missing figure.
    const result = validateSvg(
      VALID.replace('</svg>', '<script>x()</script></svg>')
    )

    expect(result).not.toHaveProperty('sanitised')
    expect(result.valid).toBe(false)
  })

  it('requires a usable viewBox, since the PDF needs an intrinsic size', () => {
    expect(validateSvg('<svg xmlns="x"><line x1="0"/></svg>').valid).toBe(false)
    expect(
      validateSvg('<svg viewBox="0 0 0 240"><line x1="0"/></svg>').valid
    ).toBe(false)
    expect(
      validateSvg('<svg viewBox="nonsense"><line x1="0"/></svg>').valid
    ).toBe(false)
  })

  it('rejects anything that is not an svg at all', () => {
    expect(validateSvg('').valid).toBe(false)
    expect(validateSvg('Here is your diagram!').valid).toBe(false)
    expect(validateSvg('<html><body/></html>').valid).toBe(false)
  })

  it('rejects an implausibly large figure', () => {
    const huge = `<svg viewBox="0 0 400 240">${'<line x1="1"/>'.repeat(20000)}</svg>`

    expect(validateSvg(huge).valid).toBe(false)
  })

  it('allows the elements a real exam figure needs', () => {
    const rich = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">',
      '<defs><marker id="a" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">',
      '<polygon points="0,0 6,3 0,6" fill="black"/></marker></defs>',
      '<g transform="translate(10,10)">',
      '<path d="M0 0 L100 50" stroke="black" marker-end="url" fill="none"/>',
      '<circle cx="50" cy="50" r="4" fill="black"/>',
      '<ellipse cx="80" cy="60" rx="10" ry="6" fill="none" stroke="black"/>',
      '<rect x="5" y="5" width="20" height="10" fill="none" stroke="black"/>',
      '<polyline points="0,0 10,10" stroke="black" fill="none"/>',
      '<text x="5" y="20" font-size="11">30°</text>',
      '</g></svg>',
    ].join('')

    // `marker-end="url"` above has no parentheses, so it is not a
    // url() reference — the check is for the function form.
    expect(validateSvg(rich).valid).toBe(true)
  })
})
