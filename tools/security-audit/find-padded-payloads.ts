import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

// A payload appended to an otherwise ordinary file is padded with a long
// run of spaces so the line reads as blank in an editor, then carries the
// whole implant on one line. Both copies found in the September 2026
// incident matched this exactly: 200 spaces, then 9,136 characters in the
// ESLint config and 1,507,522 in npm's `cli.js`.
//
// Minified libraries also have very long lines, which is why the padding
// is required as well as the length — no minifier emits a hundred
// consecutive spaces.
const MIN_PAYLOAD_LINE_LENGTH = 2_000
const MIN_PADDING_RUN = 80

const PADDING_PATTERN = new RegExp(` {${MIN_PADDING_RUN},}\\S`)

// Scanning a whole dependency tree byte-for-byte is slow enough to stop
// anyone running the check. These are the extensions a JavaScript payload
// can actually execute from.
const SCANNED_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.json'])

// Directories with nothing executable in them, or too large to be worth
// walking. `.git` matters: object files are compressed, so a payload in
// history never matches a plain-text scan anyway.
const SKIPPED_DIRECTORIES = new Set(['.git', 'datasets', 'dist', 'coverage'])

// Well past any legitimate source file; a minified bundle can exceed this
// but will not carry the padding run.
const MAX_FILE_BYTES = 80 * 1024 * 1024

export interface PaddedPayloadFinding {
  filePath: string

  // 1-indexed, to match what an editor shows.
  lineNumber: number

  lineLength: number

  paddingLength: number
}

/**
 * Finds files carrying a space-padded payload line.
 *
 * This is deliberately a *structural* test rather than a search for known
 * strings. Every string-based scan during the September 2026 incident came
 * back clean — three times — because the payload obfuscates its own
 * markers, including the campaign id and even the words `spawn` and
 * `http`. What it could not hide was its shape.
 *
 * The trade-off is the usual one: this finds unknown variants of the
 * technique, and misses a payload that pads with tabs or newlines instead.
 * It is a smoke alarm, not a virus scanner.
 */
export async function findPaddedPayloads(
  rootDirectory: string
): Promise<PaddedPayloadFinding[]> {
  const files = await listScannableFiles(rootDirectory)

  const results = await Promise.all(files.map(inspectFile))

  return results.flat()
}

/**
 * The same test against a single file.
 *
 * Exported so a finding from another check can be qualified with it. A
 * file modified after its install is only alarming if its contents are
 * also wrong — and after a legitimate repair, the timestamp alone stays
 * alarming forever, which is how a check trains people to ignore it.
 */
export async function findPaddedPayloadsInFile(
  filePath: string
): Promise<PaddedPayloadFinding[]> {
  return inspectFile(filePath)
}

async function inspectFile(filePath: string): Promise<PaddedPayloadFinding[]> {
  const content = await readFileSafely(filePath)
  if (content === undefined) {
    return []
  }

  return content.split('\n').flatMap((line, index) => {
    if (line.length < MIN_PAYLOAD_LINE_LENGTH) {
      return []
    }

    const padding = PADDING_PATTERN.exec(line)
    if (!padding) {
      return []
    }

    return [
      {
        filePath,
        lineNumber: index + 1,
        lineLength: line.length,
        // The match includes the first non-space character, which is not
        // part of the padding.
        paddingLength: padding[0].length - 1,
      },
    ]
  })
}

// An unreadable file is not a finding. A dependency tree routinely holds
// broken symlinks and permission-denied paths, and failing the whole audit
// on one of them would train people to ignore it.
async function readFileSafely(filePath: string): Promise<string | undefined> {
  try {
    const stats = await stat(filePath)
    if (stats.size > MAX_FILE_BYTES) {
      return undefined
    }

    return await readFile(filePath, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Every file under `rootDirectory` worth scanning.
 *
 * Recursive rather than expressed with array methods: a directory tree has
 * no array to map over until it has been walked, and the walk is the work.
 */
async function listScannableFiles(directory: string): Promise<string[]> {
  const entries = await readDirectorySafely(directory)

  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          return []
        }
        return listScannableFiles(entryPath)
      }

      if (!entry.isFile()) {
        return []
      }

      return SCANNED_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : []
    })
  )

  return nested.flat()
}

async function readDirectorySafely(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
}
