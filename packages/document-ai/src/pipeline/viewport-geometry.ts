import type { BoundingBox } from '../types/bounding-box'
import { applyMatrix } from './affine-matrix'
import type { Matrix } from './affine-matrix'
import type { PageViewport } from './pdfjs-types'

/**
 * Transforms a shape's local-space corners by `ctm` into PDF user space,
 * then by the page viewport into the same pixel space as
 * `TextElement.boundingBox`, and returns the axis-aligned box that encloses
 * the result. Recomputes from all four corners rather than just two — a
 * rotated or skewed CTM would otherwise give a wrong box.
 */
export function boundingBoxFromLocalCorners(
  localCorners: Array<[number, number]>,
  ctm: Matrix,
  viewport: PageViewport
): BoundingBox {
  const viewportCorners = localCorners.map(([x, y]) => {
    const [userX, userY] = applyMatrix(ctm, x, y)
    return viewport.convertToViewportPoint(userX, userY)
  })

  const xs = viewportCorners.map(([x]) => x)
  const ys = viewportCorners.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)

  return { x: left, y: top, width: right - left, height: bottom - top }
}
