import { describe, expect, it } from 'vitest'

import type { Page, TextElement } from '../types'
import { slicePageColumn } from './slice-page-column'

function textElement(text: string, x: number, y: number): TextElement {
  return {
    id: `text-${text}-${x}`,
    pageNumber: 1,
    text,
    boundingBox: { x, y, width: text.length * 6, height: 11 },
  }
}

// The real geometry of a Cambridge syllabus subject-content page: the
// Core column starts at x=62, the Supplement column at x=309.
const CORE_X = 62
const SUPPLEMENT_X = 309
const BOUNDARY = 300

function page(textElements: TextElement[]): Page {
  return {
    pageNumber: 1,
    width: 595,
    height: 842,
    textElements,
    imageElements: [],
    drawingElements: [],
    tableElements: [],
  }
}

describe('slicePageColumn', () => {
  const subjectContentPage = page([
    textElement('3 Recall and use the equation', CORE_X, 200),
    textElement(
      '9 Define acceleration as change in velocity',
      SUPPLEMENT_X,
      200
    ),
    textElement('4 Sketch, plot and interpret graphs', CORE_X, 220),
  ])

  it('keeps only the left column', () => {
    const sliced = slicePageColumn(subjectContentPage, { maxX: BOUNDARY })

    expect(sliced.textElements.map((e) => e.text)).toEqual([
      '3 Recall and use the equation',
      '4 Sketch, plot and interpret graphs',
    ])
  })

  it('keeps only the right column', () => {
    const sliced = slicePageColumn(subjectContentPage, { minX: BOUNDARY })

    expect(sliced.textElements.map((e) => e.text)).toEqual([
      '9 Define acceleration as change in velocity',
    ])
  })

  it('treats maxX as exclusive and minX as inclusive, so the two halves partition', () => {
    const onBoundary = page([textElement('on the line', BOUNDARY, 100)])

    expect(
      slicePageColumn(onBoundary, { maxX: BOUNDARY }).textElements
    ).toHaveLength(0)
    expect(
      slicePageColumn(onBoundary, { minX: BOUNDARY }).textElements
    ).toHaveLength(1)
  })

  it('keeps every element when neither bound is given', () => {
    expect(slicePageColumn(subjectContentPage, {}).textElements).toHaveLength(3)
  })

  it('preserves the page dimensions and number', () => {
    const sliced = slicePageColumn(subjectContentPage, { maxX: BOUNDARY })

    expect(sliced.pageNumber).toBe(1)
    expect(sliced.width).toBe(595)
    expect(sliced.height).toBe(842)
  })

  it('does not mutate the page it was given', () => {
    slicePageColumn(subjectContentPage, { maxX: BOUNDARY })

    expect(subjectContentPage.textElements).toHaveLength(3)
  })

  it('drops non-text elements, whose positions a column slice cannot honour', () => {
    const withGraphics: Page = {
      ...subjectContentPage,
      imageElements: [
        {
          id: 'image-1',
          pageNumber: 1,
          boundingBox: { x: 100, y: 100, width: 50, height: 50 },
          imagePath: '/tmp/1.png',
          width: 50,
          height: 50,
        },
      ],
    }

    expect(
      slicePageColumn(withGraphics, { maxX: BOUNDARY }).imageElements
    ).toEqual([])
  })
})
