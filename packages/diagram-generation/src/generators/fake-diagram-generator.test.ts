import { describe, expect, it } from 'vitest'

import { validateSvg } from '../validation/validate-svg'
import { createFakeDiagramGenerator } from './fake-diagram-generator'

describe('createFakeDiagramGenerator', () => {
  it('produces SVG that passes the same validation as a real one', async () => {
    const diagram = await createFakeDiagramGenerator().generate({
      label: 'Fig. 1.1',
      brief: 'A trolley on a ramp.',
    })

    expect(validateSvg(diagram.svg).valid).toBe(true)
    expect(diagram.width).toBe(400)
    expect(diagram.height).toBe(240)
  })

  it('is deterministic', async () => {
    const generator = createFakeDiagramGenerator()
    const brief = { label: 'Fig. 1.1', brief: 'A trolley.' }

    expect((await generator.generate(brief)).svg).toBe(
      (await generator.generate(brief)).svg
    )
  })

  it('cannot be made to emit unsafe markup through its label', async () => {
    const diagram = await createFakeDiagramGenerator().generate({
      label: '<script>alert(1)</script>',
      brief: 'x',
    })

    expect(validateSvg(diagram.svg).valid).toBe(true)
    expect(diagram.svg).not.toContain('<script')
  })
})
