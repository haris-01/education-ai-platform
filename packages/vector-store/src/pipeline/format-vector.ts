// pgvector's text input format: "[0.1,0.2,0.3]".
//
// Written here rather than pulled in as a dependency. The whole of the
// `pgvector` npm package's job on this side is this one string, and this
// project's install-script allowlist is deliberately one entry long.
export function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`
}

// pgvector hands the column back as that same string.
export function parseVector(value: string): number[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .flatMap((part) => {
      const trimmed = part.trim()
      if (!trimmed) {
        return []
      }
      return [Number(trimmed)]
    })
}
