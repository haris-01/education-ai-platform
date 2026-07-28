import type { BoundingBox, Page, TextElement } from '@education-ai/document-ai'

import type { Line } from '../types/line'

// How far apart (relative to text height) two runs' vertical centers can be
// and still count as the same line. Handles small baseline jitter (e.g. a
// subscript) without merging genuinely different lines.
const LINE_Y_TOLERANCE_RATIO = 0.5

interface LineGroup {
  anchorY: number
  members: TextElement[]
}

/**
 * Groups a page's flat, unordered `TextElement[]` into reading-order lines.
 *
 * pdfjs emits text runs in content-stream order, not visual order, and
 * splits each run wherever the font/style changes — neither is usable for
 * pattern recognition (question numbers, sub-parts, mark counts) without
 * first reconstructing "what's on the same row, left to right."
 */
export function reconstructLines(page: Page): Line[] {
  const runs = page.textElements
    .filter((element) => element.text.trim().length > 0)
    .map((element) => ({ element, centerY: centerYOf(element) }))
    .sort(
      (a, b) =>
        a.centerY - b.centerY || a.element.boundingBox.x - b.element.boundingBox.x
    )

  const groups = runs.reduce<LineGroup[]>((lines, { element, centerY }) => {
    const currentLine = lines[lines.length - 1]
    if (currentLine && belongsToLine(centerY, element, currentLine)) {
      const updatedLine: LineGroup = {
        anchorY: currentLine.anchorY,
        members: [...currentLine.members, element],
      }
      return [...lines.slice(0, -1), updatedLine]
    }
    return [...lines, { anchorY: centerY, members: [element] }]
  }, [])

  return groups.map((group) => toLine(page.pageNumber, group.members))
}

function belongsToLine(
  centerY: number,
  element: TextElement,
  line: LineGroup
): boolean {
  const lastMember = line.members[line.members.length - 1]
  const tolerance =
    Math.max(element.boundingBox.height, lastMember.boundingBox.height) *
    LINE_Y_TOLERANCE_RATIO
  return Math.abs(centerY - line.anchorY) <= tolerance
}

function toLine(pageNumber: number, members: TextElement[]): Line {
  const ordered = [...members].sort(
    (a, b) => a.boundingBox.x - b.boundingBox.x
  )

  return {
    pageNumber,
    text: ordered.map((element) => element.text.trim()).join(' '),
    boundingBox: unionBoundingBox(ordered.map((element) => element.boundingBox)),
    textElements: ordered,
  }
}

function centerYOf(element: TextElement): number {
  return element.boundingBox.y + element.boundingBox.height / 2
}

function unionBoundingBox(boxes: BoundingBox[]): BoundingBox {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))

  return { x: left, y: top, width: right - left, height: bottom - top }
}
