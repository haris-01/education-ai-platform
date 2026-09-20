// PDF transform matrices use the row-vector convention: a point is a row
// [x y 1], and transforming it is `p' = p × M`. [a, b, c, d, e, f] packs the
// matrix
//   | a  b  0 |
//   | c  d  0 |
//   | e  f  1 |
export type Matrix = [number, number, number, number, number, number]

export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0]

// Combines "apply m1, then m2" into a single matrix, so that
// applyMatrix(multiplyMatrices(m1, m2), x, y) === applyMatrix(m2, ...applyMatrix(m1, x, y)).
// This is the same concatenation formula PDF uses for its `cm` operator.
export function multiplyMatrices(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2

  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

export function applyMatrix(
  matrix: Matrix,
  x: number,
  y: number
): [number, number] {
  const [a, b, c, d, e, f] = matrix
  return [a * x + c * y + e, b * x + d * y + f]
}

// pdfjs operator args come back as `any`; this validates and narrows before
// treating something as a 6-number affine matrix.
export function toMatrix(value: unknown): Matrix | null {
  if (!isNumericArrayLike(value) || value.length !== 6) {
    return null
  }
  return [value[0], value[1], value[2], value[3], value[4], value[5]]
}

export function isNumericArrayLike(value: unknown): value is ArrayLike<number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ArrayLike<number>).length === 'number'
  )
}
