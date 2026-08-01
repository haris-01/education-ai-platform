import { describe, expect, it } from 'vitest'

import { page, parsedDocument, textElement } from '../test-fixtures'
import { buildSyllabusOverview } from './build-syllabus-overview'

describe('buildSyllabusOverview', () => {
  describe('topics', () => {
    it('extracts the topic list and stops at the next heading', () => {
      const p1 = page(1, [
        textElement(1, 'Content overview', 57, 81),
        textElement(1, 'Candidates study the following topics:', 57, 111),
        textElement(1, '1 Motion, forces and energy', 57, 130),
        textElement(1, '2 Thermal physics', 57, 146),
        // Regression: a footer line starting with a valid topic number
        // ("6 www.cambridgeinternational.org...") must not be read as a
        // topic — it sits at a distinctly smaller x than real body text.
        textElement(
          1,
          '6 www.cambridgeinternational.org/igcse Back to contents page',
          17,
          813
        ),
      ])
      const p2 = page(2, [
        textElement(2, 'Assessment overview', 57, 81),
        textElement(2, '3 Waves', 57, 111),
      ])

      const { topics } = buildSyllabusOverview(parsedDocument([p1, p2]))

      expect(topics).toEqual([
        { number: 1, name: 'Motion, forces and energy' },
        { number: 2, name: 'Thermal physics' },
      ])
    })

    it('returns nothing when the heading is not found', () => {
      const p = page(1, [textElement(1, 'Some other document', 57, 81)])
      expect(buildSyllabusOverview(parsedDocument([p])).topics).toEqual([])
    })
  })

  describe('assessmentObjectives', () => {
    it('extracts descriptions and weightings for each AO', () => {
      const p1 = page(1, [
        textElement(1, 'Assessment objectives', 57, 81),
        textElement(1, 'AO1 Knowledge with understanding', 57, 145),
        textElement(
          1,
          'Candidates should be able to demonstrate knowledge and understanding of:',
          57,
          161
        ),
        textElement(
          1,
          '• scientific phenomena, facts, laws, definitions, concepts and theories',
          57,
          180
        ),
        textElement(
          1,
          '• scientific vocabulary, terminology and conventions',
          57,
          196
        ),
        textElement(1, 'AO2 Handling information and problem-solving', 57, 327),
        textElement(
          1,
          '• locate, select, organise and present information from a variety of sources',
          57,
          375
        ),
        textElement(1, 'Weighting for assessment objectives', 57, 420),
      ])
      const p2 = page(2, [
        textElement(2, 'Assessment objective Weighting in IGCSE %', 62, 157),
        textElement(2, 'AO1 Knowledge with understanding 50', 62, 179),
        textElement(
          2,
          'AO2 Handling information and problem-solving 30',
          62,
          202
        ),
        textElement(
          2,
          'Assessment objectives as a percentage of each component',
          57,
          285
        ),
      ])

      const { assessmentObjectives } = buildSyllabusOverview(
        parsedDocument([p1, p2])
      )

      expect(assessmentObjectives).toEqual([
        {
          code: 'AO1',
          name: 'Knowledge with understanding',
          description: [
            'scientific phenomena, facts, laws, definitions, concepts and theories',
            'scientific vocabulary, terminology and conventions',
          ],
          weightingPercent: 50,
        },
        {
          code: 'AO2',
          name: 'Handling information and problem-solving',
          description: [
            'locate, select, organise and present information from a variety of sources',
          ],
          weightingPercent: 30,
        },
      ])
    })

    it('returns nothing when the heading is not found', () => {
      const p = page(1, [textElement(1, 'Some other document', 57, 81)])
      expect(buildSyllabusOverview(parsedDocument([p])).assessmentObjectives).toEqual(
        []
      )
    })
  })
})
