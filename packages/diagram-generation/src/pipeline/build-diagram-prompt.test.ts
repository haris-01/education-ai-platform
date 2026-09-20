import { describe, expect, it } from 'vitest'

import { buildDiagramPrompt } from './build-diagram-prompt'

const BRIEF = {
  label: 'Fig. 3.1',
  brief: 'A ray of light entering a glass block at 40 degrees to the normal.',
}

describe('buildDiagramPrompt', () => {
  it('states the label and what the figure must show', () => {
    const prompt = buildDiagramPrompt(BRIEF)

    expect(prompt).toContain('Fig. 3.1')
    expect(prompt).toContain('entering a glass block at 40 degrees')
  })

  it('states the constraints that keep the output embeddable', () => {
    // A diagram failing validation is thrown away, so the validator's
    // allowlist is stated in the prompt rather than hoped for.
    const prompt = buildDiagramPrompt(BRIEF)

    expect(prompt).toContain('viewBox')
    expect(prompt).toContain('No script')
    expect(prompt).toContain('no external references')
    expect(prompt).toContain('Reply with the SVG only')
  })

  it('asks for labels with units, and for print legibility', () => {
    const prompt = buildDiagramPrompt(BRIEF)

    expect(prompt).toContain('including units')
    expect(prompt).toContain('readable at A4')
  })

  it('warns against drawing more than was asked', () => {
    // An exam figure showing extra detail gives away the answer.
    expect(buildDiagramPrompt(BRIEF)).toContain(
      'Draw what is stated and nothing more'
    )
  })
})
