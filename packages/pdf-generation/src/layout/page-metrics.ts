// A4 at 72 points per inch, which is PDF's native unit.
export const PAGE_WIDTH = 595.28

export const PAGE_HEIGHT = 841.89

// Cambridge papers run a wide right margin so marks sit clear of the
// text. Everything here is in points; 28.35 points is 10mm.
export const MARGIN_TOP = 56.7

export const MARGIN_BOTTOM = 56.7

export const MARGIN_LEFT = 56.7

export const MARGIN_RIGHT = 70.9

// Where the [n] mark box sits, measured from the left margin.
export const MARKS_COLUMN_WIDTH = 42.5

export const CONTENT_WIDTH =
  PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - MARKS_COLUMN_WIDTH

export const POINTS_PER_MM = 2.835

// Below this much space, start a new page rather than orphan a
// question's first line at the foot of one.
export const MIN_SPACE_FOR_QUESTION = 84

export function mm(value: number): number {
  return value * POINTS_PER_MM
}
