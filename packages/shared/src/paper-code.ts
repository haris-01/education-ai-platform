/**
 * Combines a paper number and optional variant into the short code exam
 * boards print on their own papers (e.g. paper 4 variant 1 -> "41").
 * Falls back to just the paper number when there's no variant (e.g.
 * specimen papers, which aren't split by administrative zone).
 */
export function paperCode(paper: number, variant?: number): string {
  return variant !== undefined ? `${paper}${variant}` : String(paper)
}
