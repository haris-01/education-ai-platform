import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

import type { BoundingBox } from '../types/bounding-box'
import { isNumericArrayLike } from './affine-matrix'
import type { Matrix } from './affine-matrix'
import type { OperatorList, PageViewport } from './pdfjs-types'
import { trackCtm } from './track-ctm'
import { boundingBoxFromLocalCorners } from './viewport-geometry'

/**
 * Returns the bounding box of every vector path (`constructPath` op) on a
 * page, in the same viewport coordinate space as `TextElement.boundingBox`.
 * This is raw geometry only — grouping these into diagrams
 * (`extract-drawing-elements.ts`) or tables (`extract-table-elements.ts`)
 * happens downstream.
 */
export function extractPathBoxes(
  operatorList: OperatorList,
  viewport: PageViewport
): BoundingBox[] {
  const ctmByIndex = trackCtm(operatorList)

  return operatorList.fnArray.flatMap((fn, index) => {
    if (fn !== OPS.constructPath) {
      return []
    }
    const boundingBox = pathBoundingBox(
      operatorList.argsArray[index],
      ctmByIndex[index],
      viewport
    )
    return boundingBox ? [boundingBox] : []
  })
}

// constructPath's args are [opCodes, packedCoords, minMax] in this pdfjs
// version — the first two are its internal packed path-rendering format
// (undocumented, and irrelevant here). `minMax` is the path's bounding box
// in the coordinate space active before this path was drawn, i.e. before
// its CTM is applied — so `ctm` still needs to be applied to land in page
// space.
function pathBoundingBox(
  args: unknown,
  ctm: Matrix,
  viewport: PageViewport
): BoundingBox | null {
  const minMax = extractMinMax(args)
  if (!minMax) {
    return null
  }
  const [minX, minY, maxX, maxY] = minMax

  const localCorners: Array<[number, number]> = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]

  return boundingBoxFromLocalCorners(localCorners, ctm, viewport)
}

function extractMinMax(args: unknown): [number, number, number, number] | null {
  if (!Array.isArray(args) || args.length < 3) {
    return null
  }

  const minMax = args[2]
  if (!isNumericArrayLike(minMax) || minMax.length !== 4) {
    return null
  }

  return [minMax[0], minMax[1], minMax[2], minMax[3]]
}
