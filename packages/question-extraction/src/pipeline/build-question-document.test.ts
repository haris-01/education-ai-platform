import { describe, expect, it } from 'vitest'

import {
  drawingElement,
  imageElement,
  page,
  parsedDocument,
  tableElement,
  textElement,
} from '../test-fixtures'
import { buildQuestionDocument } from './build-question-document'

describe('buildQuestionDocument', () => {
  it('builds a simple question with parts and marks', () => {
    const p = page(1, [
      textElement(1, '1 Fig. 1.1 shows a graph.', 50, 62),
      textElement(1, '(a) Calculate the acceleration.', 72, 100),
      textElement(1, 'acceleration = .......... [3]', 95, 130),
      textElement(1, '(b) State the unit.', 72, 160),
      textElement(1, '.......... [2]', 95, 190),
      textElement(1, '[Total: 5]', 504, 220),
      textElement(1, '© UCLES 2020', 50, 780),
    ])

    const { questions } = buildQuestionDocument(parsedDocument([p]))

    expect(questions).toHaveLength(1)
    const [q] = questions
    expect(q.number).toBe(1)
    expect(q.text).toBe('Fig. 1.1 shows a graph.')
    expect(q.marks).toBe(5)
    expect(q.parts.map((part) => [part.label, part.marks])).toEqual([
      ['a', 3],
      ['b', 2],
    ])
  })

  it('keeps a question open across a page boundary until the next question number', () => {
    const p1 = page(1, [
      textElement(1, '1 Some stem text spanning pages.', 50, 62),
      textElement(1, '(a) Define X.', 72, 100),
      textElement(1, '.......... [2]', 95, 130),
    ])
    const p2 = page(2, [
      textElement(2, '(b) Second part on the next page.', 72, 62),
      textElement(2, '.......... [3]', 95, 90),
    ])

    const { questions } = buildQuestionDocument(parsedDocument([p1, p2]))

    expect(questions).toHaveLength(1)
    const [q] = questions
    expect(q.pageNumbers).toEqual([1, 2])
    expect(q.parts.map((part) => part.label)).toEqual(['a', 'b'])
  })

  it('nests roman-numeral sub-sub-parts under their parent sub-part, not as sibling parts', () => {
    // Regression: "(i)" was matching the sub-part pattern (single lowercase
    // letter) before ever reaching the sub-sub-part check, so (b)'s
    // (i)/(ii)/(iii) were being promoted into top-level parts instead of
    // nesting under (b).
    const p = page(1, [
      textElement(1, '2 (a) Complete the definitions.', 50, 62),
      textElement(1, 'mass x acceleration = ...... [2]', 95, 90),
      textElement(1, '(b) Fig. 2.2 shows a golf club.', 72, 130),
      textElement(1, '(i) Calculate the momentum.', 96, 160),
      textElement(1, 'momentum = .......... [2]', 283, 190),
      textElement(1, '(ii) Calculate the average force.', 93, 220),
      textElement(1, 'average force = .......... [2]', 271, 250),
      textElement(1, '(iii) State the energy stored.', 90, 280),
      textElement(1, '.......... [1]', 120, 310),
      textElement(1, '[Total: 7]', 504, 340),
    ])

    const { questions } = buildQuestionDocument(parsedDocument([p]))

    expect(questions).toHaveLength(1)
    const [q] = questions
    expect(q.marks).toBe(7)
    expect(q.parts.map((part) => part.label)).toEqual(['a', 'b'])
    const partB = q.parts[1]
    expect(partB.subParts.map((sub) => [sub.label, sub.marks])).toEqual([
      ['i', 2],
      ['ii', 2],
      ['iii', 1],
    ])
  })

  it('confirms four sequential option lines as a multiple-choice question', () => {
    const p = page(1, [
      textElement(1, '4 Two runners take part in a race.', 50, 62),
      textElement(1, 'A Both runners move at the same speed.', 72, 292),
      textElement(1, 'B Runner 1 has zero acceleration.', 72, 314),
      textElement(1, 'C Runner 1 runs ahead of runner 2.', 72, 336),
      textElement(1, 'D Runner 2 is slowing down.', 72, 358),
    ])

    const { questions } = buildQuestionDocument(parsedDocument([p]))

    expect(questions).toHaveLength(1)
    expect(questions[0].options).toEqual([
      { label: 'A', text: 'Both runners move at the same speed.' },
      { label: 'B', text: 'Runner 1 has zero acceleration.' },
      { label: 'C', text: 'Runner 1 runs ahead of runner 2.' },
      { label: 'D', text: 'Runner 2 is slowing down.' },
    ])
  })

  it('does not mistake an ordinary sentence starting with "A" for option A', () => {
    // Regression: "A load is fixed to trolley P." is an ordinary sentence,
    // not an MCQ option, but is textually identical to a real option A at
    // the pattern level — it was getting committed as a lone, unconfirmed
    // option instead of staying part of the question's stem text.
    const p = page(1, [
      textElement(1, '2 Fig. 2.1 shows two trolleys.', 50, 62),
      textElement(1, 'A load is fixed to trolley P.', 72, 88),
      textElement(1, '(a) Calculate the speed.', 72, 120),
      textElement(1, 'speed = .......... [3]', 95, 150),
      textElement(1, '[Total: 3]', 504, 180),
    ])

    const { questions } = buildQuestionDocument(parsedDocument([p]))

    expect(questions).toHaveLength(1)
    const [q] = questions
    expect(q.options).toEqual([])
    expect(q.text).toBe('Fig. 2.1 shows two trolleys. A load is fixed to trolley P.')
  })

  it('attaches an image, drawing, and table to whichever part was open at that position', () => {
    const p = page(
      1,
      [
        textElement(1, '1 Fig. 1.1 shows a circuit.', 50, 62),
        textElement(1, '(a) Calculate the current.', 72, 200),
        textElement(1, 'current = .......... [2]', 95, 230),
      ],
      {
        drawingElements: [drawingElement(1, 200, 100)], // between Q stem and (a) -> belongs to the question
        imageElements: [imageElement(1, 200, 210)], // between (a) and its answer line -> belongs to (a)
        tableElements: [tableElement(1, 200, 260)], // after (a)'s answer line -> still belongs to (a)
      }
    )

    const { questions } = buildQuestionDocument(parsedDocument([p]))

    const [q] = questions
    expect(q.drawingRefs).toHaveLength(1)
    expect(q.parts[0].imageRefs).toHaveLength(1)
    expect(q.parts[0].tableRefs).toHaveLength(1)
  })

  it('does not let a footer or page-header line contaminate question text', () => {
    const p1 = page(1, [
      textElement(1, '1 A stem that continues onto the next page.', 50, 62),
      textElement(1, '(a) Explain the effect.', 72, 100),
      textElement(1, '.......... [2]', 95, 130),
      textElement(1, '© UCLES 2020 0625/04/SP/23', 50, 780),
    ])
    const p2 = page(2, [
      textElement(2, '2', 292, 36), // bare page-header number
      textElement(2, '(b) A second part on the next page.', 72, 62),
      textElement(2, '.......... [1]', 95, 90),
    ])

    const { questions } = buildQuestionDocument(parsedDocument([p1, p2]))

    const [q] = questions
    // The trailing "[2]"/"[1]" text stays in `text` (only the numeric
    // value is pulled out separately as `marks`) — the point of this test
    // is that the boilerplate lines contribute nothing, not that marks
    // brackets are stripped from prose.
    expect(q.parts.map((part) => part.text)).toEqual([
      'Explain the effect. .......... [2]',
      'A second part on the next page. .......... [1]',
    ])
  })
})
