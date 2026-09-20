import type { BoundingBox } from '../types/bounding-box'

// A path this thin in one dimension is a stroked rule or gridline, not a
// filled shape — used to route table borders away from diagram detection.
const THIN_THRESHOLD_PX = 1

export function isThinBox(box: BoundingBox): boolean {
  return box.width <= THIN_THRESHOLD_PX || box.height <= THIN_THRESHOLD_PX
}

export type LineOrientation = 'horizontal' | 'vertical'

export interface Line {
  orientation: LineOrientation
  boundingBox: BoundingBox
}

/** Classifies a thin box as a horizontal or vertical line; `null` for a
 * degenerate box that's thin in both dimensions (a dot, not a line). */
export function classifyThinBox(box: BoundingBox): Line | null {
  const isThinWidth = box.width <= THIN_THRESHOLD_PX
  const isThinHeight = box.height <= THIN_THRESHOLD_PX

  if (isThinWidth && isThinHeight) {
    return null
  }
  if (isThinWidth) {
    return { orientation: 'vertical', boundingBox: box }
  }
  if (isThinHeight) {
    return { orientation: 'horizontal', boundingBox: box }
  }
  return null
}
