import type { DrawingElement } from '../types'
import { isThinBox } from './box-shape'
import { clusterByProximity } from './cluster-boxes'
import { extractPathBoxes } from './extract-path-boxes'
import type { OperatorList, PageViewport } from './pdfjs-types'

// How close two shape fragments need to be (px) to count as one diagram.
// Cambridge diagrams are drawn as many adjoining strokes/curves, so a small
// gap is enough — a larger one would start merging unrelated diagrams.
const CLUSTER_GAP_PX = 6

/**
 * Extracts diagram-level drawing elements: non-thin vector shapes (diagram
 * frames, filled regions, curves), clustered by spatial proximity so one
 * diagram — drawn as many separate path operators — becomes one element
 * instead of dozens. Thin rules/gridlines are handled separately by
 * `extractTableElements`, since those are structural, not diagrams.
 */
export function extractDrawingElements(
  operatorList: OperatorList,
  viewport: PageViewport,
  pageNumber: number
): DrawingElement[] {
  const shapeBoxes = extractPathBoxes(operatorList, viewport).filter(
    (box) => !isThinBox(box)
  )

  const clusters = clusterByProximity(shapeBoxes, (box) => box, CLUSTER_GAP_PX)

  return clusters.map((cluster, index) => ({
    id: `${pageNumber}-drawing-${index}`,
    pageNumber,
    boundingBox: cluster.boundingBox,
  }))
}
