import type { BoundingBox } from '../types/bounding-box'

export interface BoxCluster<T> {
  items: T[]
  boundingBox: BoundingBox
}

/**
 * Groups items into spatial clusters using connected components: two items
 * are in the same cluster if their bounding boxes overlap, or are within
 * `gapPx` of each other — directly, or transitively through another item.
 * Used to turn raw per-path-operator boxes into diagram- or table-level
 * regions.
 */
export function clusterByProximity<T>(
  items: T[],
  getBoundingBox: (item: T) => BoundingBox,
  gapPx: number
): BoxCluster<T>[] {
  const boxes = items.map(getBoundingBox)

  // Union-find needs mutable parent pointers to be efficient and readable;
  // this state is local scratch space, not shared/passed-in data, so it
  // doesn't fall under the project's "don't mutate" rule for domain objects.
  const parent = items.map((_, index) => index)

  const find = (index: number): number => {
    if (parent[index] === index) {
      return index
    }
    const root = find(parent[index])
    parent[index] = root
    return root
  }

  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent[rootA] = rootB
    }
  }

  boxes.forEach((box, i) => {
    boxes.forEach((otherBox, j) => {
      if (j > i && isNear(box, otherBox, gapPx)) {
        union(i, j)
      }
    })
  })

  const groupedIndices = items.reduce<Map<number, number[]>>(
    (groups, _, index) => {
      const root = find(index)
      const group = groups.get(root) ?? []
      groups.set(root, [...group, index])
      return groups
    },
    new Map()
  )

  return Array.from(groupedIndices.values()).map((indices) => {
    const clusterItems = indices.map((index) => items[index])
    const clusterBoxes = indices.map((index) => boxes[index])
    return { items: clusterItems, boundingBox: enclosingBox(clusterBoxes) }
  })
}

function isNear(a: BoundingBox, b: BoundingBox, gapPx: number): boolean {
  const overlapsX = a.x - gapPx <= b.x + b.width && a.x + a.width + gapPx >= b.x
  const overlapsY =
    a.y - gapPx <= b.y + b.height && a.y + a.height + gapPx >= b.y
  return overlapsX && overlapsY
}

function enclosingBox(boxes: BoundingBox[]): BoundingBox {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
