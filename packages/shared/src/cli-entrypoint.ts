import { pathToFileURL } from 'node:url'

/**
 * True when `moduleUrl` (a module's own `import.meta.url`) is the script
 * Node was started with — the guard that lets a module be both an
 * importable library and a CLI.
 *
 * Comparing against a hand-built `` `file://${process.argv[1]}` `` looks
 * equivalent but is not: `import.meta.url` is a percent-encoded URL, so a
 * path containing a space (or any other character a URL must escape)
 * never matches and the CLI silently does nothing. `pathToFileURL`
 * applies the same encoding to both sides.
 */
export function isCliEntrypoint(moduleUrl: string): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) {
    return false
  }

  return moduleUrl === pathToFileURL(entryPath).href
}
