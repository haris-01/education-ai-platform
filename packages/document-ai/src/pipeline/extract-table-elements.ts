import type { TableElement } from '../types'
import type { Line } from './box-shape'
import { classifyThinBox } from './box-shape'
import { clusterByProximity } from './cluster-boxes'
import type { BoxCluster } from './cluster-boxes'
import { extractPathBoxes } from './extract-path-boxes'
import type { OperatorList, PageViewport } from './pdfjs-types'

// Table gridlines are drawn touching or nearly touching each other, so a
// tight gap is enough to link them into one table region.
const CLUSTER_GAP_PX = 3

// Two lines within this many px of each other are treated as the same row
// or column boundary (covers double-stroked rules).
const POSITION_TOLERANCE_PX = 2

// Small icon glyphs (tick boxes, logo marks) are sometimes drawn from a
// couple of short strokes that technically form a tiny 2x2 lattice — too
// small to be a real table, so a minimum region size filters those out.
const MIN_TABLE_SIZE_PX = 20

/**
 * Detects tables as lattices of thin horizontal/vertical lines: a cluster of
 * lines counts as a table only if it has at least 2 distinct row boundaries
 * *and* 2 distinct column boundaries. A lone rule (e.g. a divider under a
 * heading) has lines in only one orientation and is correctly not a table.
 */
export function extractTableElements(
  operatorList: OperatorList,
  viewport: PageViewport,
  pageNumber: number
): TableElement[] {
  const lines = extractPathBoxes(operatorList, viewport)
    .map(classifyThinBox)
    .filter((line): line is Line => line !== null)

  const clusters = clusterByProximity(
    lines,
    (line) => line.boundingBox,
    CLUSTER_GAP_PX
  )

  return clusters
    .map((cluster, index) => toTableElement(cluster, pageNumber, index))
    .filter((table): table is TableElement => table !== null)
}

function toTableElement(
  cluster: BoxCluster<Line>,
  pageNumber: number,
  index: number
): TableElement | null {
  const rowBoundaries = uniquePositions(
    cluster.items
      .filter((line) => line.orientation === 'horizontal')
      .map((line) => line.boundingBox.y)
  )
  const columnBoundaries = uniquePositions(
    cluster.items
      .filter((line) => line.orientation === 'vertical')
      .map((line) => line.boundingBox.x)
  )

  const isLatticeShaped =
    rowBoundaries.length >= 2 && columnBoundaries.length >= 2
  const isLargeEnough =
    cluster.boundingBox.width >= MIN_TABLE_SIZE_PX &&
    cluster.boundingBox.height >= MIN_TABLE_SIZE_PX

  if (!isLatticeShaped || !isLargeEnough) {
    return null
  }

  return {
    id: `${pageNumber}-table-${index}`,
    pageNumber,
    boundingBox: cluster.boundingBox,
    rows: rowBoundaries.length - 1,
    columns: columnBoundaries.length - 1,
  }
}

function uniquePositions(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)

  return sorted.reduce<number[]>((positions, value) => {
    const last = positions.at(-1)
    if (last === undefined || value - last > POSITION_TOLERANCE_PX) {
      return [...positions, value]
    }
    return positions
  }, [])
}
