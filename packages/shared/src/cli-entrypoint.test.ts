import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { isCliEntrypoint } from './cli-entrypoint.js'

const ORIGINAL_ARGV = process.argv

afterEach(() => {
  process.argv = ORIGINAL_ARGV
})

function withEntryPath(entryPath: string): void {
  process.argv = [ORIGINAL_ARGV[0], entryPath]
}

describe('isCliEntrypoint', () => {
  it('is true when the module is the script node was started with', () => {
    const entryPath = '/repo/apps/worker/src/jobs/cambridge/index.ts'
    withEntryPath(entryPath)

    expect(isCliEntrypoint(pathToFileURL(entryPath).href)).toBe(true)
  })

  it('is true when the path contains a space', () => {
    // The bug this helper exists for: `file://${process.argv[1]}` leaves
    // the space literal while `import.meta.url` percent-encodes it, so
    // the CLI block silently never ran from a path like "AI practice".
    const entryPath = '/Users/me/code/AI practice/repo/src/index.ts'
    withEntryPath(entryPath)

    const moduleUrl = pathToFileURL(entryPath).href

    expect(moduleUrl).toContain('%20')
    expect(moduleUrl).not.toBe(`file://${entryPath}`)
    expect(isCliEntrypoint(moduleUrl)).toBe(true)
  })

  it('is true when the path contains other characters a URL must escape', () => {
    const entryPath = '/repo/a#b/c?d/index.ts'
    withEntryPath(entryPath)

    expect(isCliEntrypoint(pathToFileURL(entryPath).href)).toBe(true)
  })

  it('is false when the module was imported rather than started', () => {
    withEntryPath('/repo/apps/worker/src/jobs/cambridge/index.ts')

    const importedUrl = pathToFileURL('/repo/packages/shared/src/logger.ts')

    expect(isCliEntrypoint(importedUrl.href)).toBe(false)
  })

  it('is false when node was started without a script path', () => {
    process.argv = [ORIGINAL_ARGV[0]]

    expect(isCliEntrypoint(pathToFileURL('/repo/src/index.ts').href)).toBe(
      false
    )
  })
})
