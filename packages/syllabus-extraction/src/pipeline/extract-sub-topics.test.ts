import { describe, expect, it } from 'vitest'

import { page, parsedDocument, textElement } from '../test-fixtures'
import { extractSubTopics } from './extract-sub-topics'

// The real geometry of a Cambridge subject-content page: Core column at
// x=62 wrapping to x=79, Supplement column at x=309 wrapping to x=326,
// page footer back at x=17.
const CORE_X = 62
const CORE_WRAP_X = 79
const SUPPLEMENT_X = 309
const SUPPLEMENT_WRAP_X = 326
const FOOTER_X = 17

function columnHeaders(pageNumber: number, y: number) {
  return [
    textElement(pageNumber, 'Core', CORE_X, y),
    textElement(pageNumber, 'Supplement', SUPPLEMENT_X, y),
  ]
}

describe('extractSubTopics', () => {
  it('keeps the two columns apart when they collide at the same height', () => {
    // The case that makes this a layout problem rather than a text one.
    // Reconstructing lines across the whole page width glues these two
    // unrelated objectives into "3 Recall and use the equation 9 Define
    // acceleration as change in velocity per unit time".
    const document = parsedDocument([
      page(1, [
        textElement(1, '1.2 Motion', CORE_X, 80),
        ...columnHeaders(1, 95),
        textElement(1, '3 Recall and use the equation', CORE_X, 120),
        textElement(
          1,
          '9 Define acceleration as change in velocity per unit time',
          SUPPLEMENT_X,
          120
        ),
      ]),
    ])

    const [section] = extractSubTopics(document)[0].sections

    expect(section.core).toEqual([
      { number: 3, text: 'Recall and use the equation' },
    ])
    expect(section.supplement).toEqual([
      {
        number: 9,
        text: 'Define acceleration as change in velocity per unit time',
      },
    ])
  })

  it('reads the sub-topic number, topic number and name', () => {
    const document = parsedDocument([
      page(1, [
        textElement(1, '4.5 Electromagnetic induction', CORE_X, 80),
        ...columnHeaders(1, 95),
        textElement(1, '1 Know that a conductor moving across', CORE_X, 120),
      ]),
    ])

    const [subTopic] = extractSubTopics(document)

    expect(subTopic.number).toBe('4.5')
    expect(subTopic.topicNumber).toBe(4)
    expect(subTopic.name).toBe('Electromagnetic induction')
  })

  describe('sections', () => {
    it('separates a sub-topic into its numbered sections', () => {
      // Objective numbering restarts at each section, so folding these
      // into one list would produce "1,2,1" and lose which objective
      // belongs where.
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.5 Forces', CORE_X, 80),
          textElement(1, '1.5.1 Effects of forces', CORE_X, 95),
          ...columnHeaders(1, 110),
          textElement(1, '1 Know that forces may produce motion', CORE_X, 130),
          textElement(1, '2 Describe solid friction', CORE_X, 150),
          textElement(1, '1.5.2 Turning effect of forces', CORE_X, 170),
          ...columnHeaders(1, 185),
          textElement(1, '1 Describe the moment of a force', CORE_X, 205),
        ]),
      ])

      const [subTopic] = extractSubTopics(document)

      expect(subTopic.sections.map((s) => s.number)).toEqual(['1.5.1', '1.5.2'])
      expect(subTopic.sections[0].core.map((o) => o.number)).toEqual([1, 2])
      expect(subTopic.sections[1].core.map((o) => o.number)).toEqual([1])
    })

    it('gives a sub-topic with no numbered sections one implicit section', () => {
      // 1.1 and 1.6 list objectives directly. An implicit section lets a
      // consumer iterate sections without handling two shapes.
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.1 Physical quantities', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(1, '1 Describe the use of rulers', CORE_X, 120),
        ]),
      ])

      const [subTopic] = extractSubTopics(document)

      expect(subTopic.sections).toHaveLength(1)
      expect(subTopic.sections[0].number).toBe('1.1')
      expect(subTopic.sections[0].name).toBe('Physical quantities')
    })

    it('does not read a section heading as a sub-topic', () => {
      // "1.5.1 Effects of forces" matches the sub-topic pattern too, as
      // sub-topic "1.5" named "1 Effects of forces".
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.5 Forces', CORE_X, 80),
          textElement(1, '1.5.1 Effects of forces', CORE_X, 95),
          ...columnHeaders(1, 110),
          textElement(1, '1 Know that forces may produce motion', CORE_X, 130),
        ]),
      ])

      const subTopics = extractSubTopics(document)

      expect(subTopics).toHaveLength(1)
      expect(subTopics[0].name).toBe('Forces')
    })
  })

  describe('continuation across pages', () => {
    it('continues a sub-topic whose heading is reprinted', () => {
      const document = parsedDocument([
        page(1, [
          textElement(1, '3.1 General properties of waves', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(1, '1 Know that waves transfer energy', CORE_X, 120),
        ]),
        page(2, [
          textElement(
            2,
            '3.1 General properties of waves continued',
            CORE_X,
            80
          ),
          ...columnHeaders(2, 95),
          textElement(
            2,
            '2 Describe what is meant by wave motion',
            CORE_X,
            120
          ),
        ]),
      ])

      const subTopics = extractSubTopics(document)

      expect(subTopics).toHaveLength(1)
      expect(subTopics[0].sections).toHaveLength(1)
      expect(subTopics[0].sections[0].core.map((o) => o.number)).toEqual([1, 2])
    })

    it('continues a section whose heading is reprinted', () => {
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.5 Forces', CORE_X, 80),
          textElement(1, '1.5.1 Effects of forces', CORE_X, 95),
          ...columnHeaders(1, 110),
          textElement(1, '1 Know that forces may produce motion', CORE_X, 130),
        ]),
        page(2, [
          textElement(2, '1.5 Forces continued', CORE_X, 80),
          textElement(2, '1.5.1 Effects of forces continued', CORE_X, 95),
          ...columnHeaders(2, 110),
          textElement(2, '2 Describe solid friction', CORE_X, 130),
        ]),
      ])

      const [subTopic] = extractSubTopics(document)

      expect(subTopic.sections).toHaveLength(1)
      expect(subTopic.sections[0].core.map((o) => o.number)).toEqual([1, 2])
    })

    it('ignores a bare "continued" marker in the table header', () => {
      const document = parsedDocument([
        page(1, [
          textElement(1, '3.4 Sound', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(1, '1 Describe the production of sound', CORE_X, 120),
          textElement(1, 'continued', SUPPLEMENT_X, 135),
        ]),
      ])

      const [subTopic] = extractSubTopics(document)

      expect(subTopic.sections[0].core[0].text).toBe(
        'Describe the production of sound'
      )
      expect(subTopic.sections[0].supplement).toEqual([])
    })
  })

  describe('wrapped lines', () => {
    it('joins a wrapped Core objective onto the line above it', () => {
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.1 Physical quantities', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(
            1,
            '1 Describe the use of rulers and measuring',
            CORE_X,
            120
          ),
          textElement(
            1,
            'cylinders to find a length or a volume',
            CORE_WRAP_X,
            135
          ),
          textElement(1, '2 Describe how to measure time', CORE_X, 150),
        ]),
      ])

      const [section] = extractSubTopics(document)[0].sections

      expect(section.core).toEqual([
        {
          number: 1,
          text: 'Describe the use of rulers and measuring cylinders to find a length or a volume',
        },
        { number: 2, text: 'Describe how to measure time' },
      ])
    })

    it('joins a wrapped Supplement objective in its own column', () => {
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.2 Motion', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(1, '1 Define speed', CORE_X, 120),
          textElement(
            1,
            '9 Define acceleration as change in',
            SUPPLEMENT_X,
            120
          ),
          textElement(1, 'velocity per unit time', SUPPLEMENT_WRAP_X, 135),
        ]),
      ])

      const [section] = extractSubTopics(document)[0].sections

      expect(section.supplement).toEqual([
        {
          number: 9,
          text: 'Define acceleration as change in velocity per unit time',
        },
      ])
    })

    it('does not read a wrapped equation as a heading', () => {
      // "9.8 m/s 2" is the tail of "approximately 9.8 m/s²" and matches
      // the sub-topic pattern exactly. Only its indent separates it from
      // a real heading.
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.2 Motion', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(
            1,
            '8 State that the acceleration of free fall',
            CORE_X,
            120
          ),
          textElement(1, 'is approximately', CORE_WRAP_X, 135),
          textElement(1, '9.8 m/s 2', CORE_WRAP_X, 150),
        ]),
      ])

      const subTopics = extractSubTopics(document)

      expect(subTopics).toHaveLength(1)
      expect(subTopics[0].sections[0].core[0].text).toBe(
        'State that the acceleration of free fall is approximately 9.8 m/s 2'
      )
    })
  })

  describe('boilerplate and other documents', () => {
    it('is not thrown off by a page footer that starts with a number', () => {
      // "10 www.cambridgeinternational.org/igcse Back to contents page"
      // matches the objective pattern and sits further left than the real
      // column, so taking the leftmost numbered line as the margin pushed
      // the margin out to the footer and stopped headings being read.
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.1 Physical quantities', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(1, '1 Describe the use of rulers', CORE_X, 120),
          textElement(1, '2 Describe how to measure time', CORE_X, 140),
          textElement(
            1,
            '10 www.cambridgeinternational.org/igcse Back to contents page',
            FOOTER_X,
            813
          ),
        ]),
      ])

      const subTopics = extractSubTopics(document)

      expect(subTopics).toHaveLength(1)
      expect(subTopics[0].sections[0].core).toHaveLength(2)
    })

    it('does not read a topic heading as an objective', () => {
      // "2 Thermal physics" opens the next topic and is identical in
      // shape to a numbered objective. The already-extracted topic list
      // is what separates them.
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.8 Pressure', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(
            1,
            '1 Define pressure as force per unit area',
            CORE_X,
            120
          ),
          textElement(1, '2 Thermal physics', CORE_X, 140),
        ]),
      ])

      const subTopics = extractSubTopics(document, [
        { number: 2, name: 'Thermal physics' },
      ])

      expect(subTopics[0].sections[0].core.map((o) => o.text)).toEqual([
        'Define pressure as force per unit area',
      ])
    })

    it('returns nothing for a document with no subject-content table', () => {
      const document = parsedDocument([
        page(1, [textElement(1, 'Some other document', CORE_X, 80)]),
      ])

      expect(extractSubTopics(document)).toEqual([])
    })

    it('ignores pages without the two-column header', () => {
      const document = parsedDocument([
        page(1, [
          textElement(1, '1.1 Physical quantities', CORE_X, 80),
          ...columnHeaders(1, 95),
          textElement(1, '1 Describe the use of rulers', CORE_X, 120),
        ]),
        page(2, [
          textElement(2, '9.9 Not subject content', CORE_X, 80),
          textElement(2, '1 Should not be collected', CORE_X, 120),
        ]),
      ])

      expect(extractSubTopics(document).map((s) => s.number)).toEqual(['1.1'])
    })
  })
})
