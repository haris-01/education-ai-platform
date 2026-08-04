import { describe, expect, it } from 'vitest'

import { page, parsedDocument, tableElement } from '../test-fixtures'
import { buildTheoryMarkScheme } from './build-theory-mark-scheme'

describe('buildTheoryMarkScheme', () => {
  it('reads one mark point per row, keyed by question number', () => {
    const doc = parsedDocument([
      page(
        1,
        [],
        [
          tableElement(1, 100, [
            ['Question', 'Answer', 'Marks'],
            ['1(a)', 'rate of change of velocity', 'B1'],
            ['1(b)', '0.021 N', 'A2'],
          ]),
        ]
      ),
    ])

    const { questions } = buildTheoryMarkScheme(doc)

    expect(questions).toEqual([
      {
        questionNumber: '1(a)',
        markPoints: [{ text: 'rate of change of velocity', markCode: 'B1' }],
      },
      {
        questionNumber: '1(b)',
        markPoints: [{ text: '0.021 N', markCode: 'A2' }],
      },
    ])
  })

  it('carries a blank Question cell forward to the row above', () => {
    const doc = parsedDocument([
      page(
        1,
        [],
        [
          tableElement(1, 100, [
            ['Question', 'Answer', 'Marks'],
            ['2(a)(i)', '0.16 m/s', 'A3'],
            ['', 'conservation of momentum', 'C1'],
            ['', 'v = m1v1 / m2', 'C1'],
          ]),
        ]
      ),
    ])

    const { questions } = buildTheoryMarkScheme(doc)

    expect(questions).toHaveLength(1)
    expect(questions[0].questionNumber).toBe('2(a)(i)')
    expect(questions[0].markPoints).toHaveLength(3)
  })

  it('ignores tables that are not shaped like a mark scheme', () => {
    const doc = parsedDocument([
      page(
        1,
        [],
        [
          tableElement(1, 100, [
            ['Grade', 'Threshold'],
            ['A*', '80'],
          ]),
        ]
      ),
    ])

    const { questions } = buildTheoryMarkScheme(doc)

    expect(questions).toEqual([])
  })

  it('carries the current question across a page break', () => {
    const doc = parsedDocument([
      page(
        1,
        [],
        [
          tableElement(1, 100, [
            ['Question', 'Answer', 'Marks'],
            ['3(a)', 'first method', 'C1'],
          ]),
        ]
      ),
      page(
        2,
        [],
        [
          tableElement(2, 50, [
            ['Question', 'Answer', 'Marks'],
            ['', 'alternative method', 'C1'],
          ]),
        ]
      ),
    ])

    const { questions } = buildTheoryMarkScheme(doc)

    expect(questions).toHaveLength(1)
    expect(questions[0].questionNumber).toBe('3(a)')
    expect(questions[0].markPoints).toHaveLength(2)
  })

  it('skips fully blank rows', () => {
    const doc = parsedDocument([
      page(
        1,
        [],
        [
          tableElement(1, 100, [
            ['Question', 'Answer', 'Marks'],
            ['4(a)', 'an answer', 'B1'],
            ['', '', ''],
          ]),
        ]
      ),
    ])

    const { questions } = buildTheoryMarkScheme(doc)

    expect(questions).toEqual([
      {
        questionNumber: '4(a)',
        markPoints: [{ text: 'an answer', markCode: 'B1' }],
      },
    ])
  })
})
