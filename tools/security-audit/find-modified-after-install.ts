import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

// A package is written to disk in one go, so its files share an install
// timestamp to within a few seconds. A file modified long afterwards was
// modified by something other than the installer.
//
// Twelve hours is comfortably past any install, while still catching a
// tamper that happened the same night — npm's `cli.js` was patched at
// 02:24 against an installation dated 29 July, so the real signal was
// weeks wide.
const TOLERANCE_MS = 12 * 60 * 60 * 1000

const SKIPPED_DIRECTORIES = new Set(['.git', '.bin', 'node_modules'])

export interface ModifiedAfterInstallFinding {
  filePath: string

  modifiedAt: Date

  // What the rest of the installation is dated.
  installedAt: Date

  hoursLater: number
}

/**
 * Finds files in an installed package tree whose modification time does
 * not match the rest of the installation.
 *
 * This is what actually located the compromised npm in the September 2026
 * incident. `npm/lib/cli.js` was the single file in the entire npm
 * installation with a later date than its neighbours — a far louder
 * signal than anything in its contents, which were obfuscated past the
 * point of being searchable.
 *
 * Build artefacts (`.node` binaries compiled at install time) legitimately
 * trip this, so findings are a prompt to look, not a verdict.
 */
export async function findModifiedAfterInstall(
  packageRoot: string
): Promise<ModifiedAfterInstallFinding[]> {
  const files = await listFilesWithTimes(packageRoot)
  if (files.length === 0) {
    return []
  }

  const installedAt = medianTime(files.map((file) => file.modifiedAt))

  return files.flatMap((file): ModifiedAfterInstallFinding[] => {
    const deltaMs = file.modifiedAt.getTime() - installedAt.getTime()
    if (deltaMs <= TOLERANCE_MS) {
      return []
    }

    return [
      {
        filePath: file.filePath,
        modifiedAt: file.modifiedAt,
        installedAt,
        hoursLater: Math.round(deltaMs / (60 * 60 * 1000)),
      },
    ]
  })
}

// The median, not the mean: one file touched years later would drag an
// average far enough to hide everything else.
function medianTime(times: Date[]): Date {
  const sorted = [...times].sort((a, b) => a.getTime() - b.getTime())
  return sorted[Math.floor(sorted.length / 2)]
}

interface FileTime {
  filePath: string
  modifiedAt: Date
}

/**
 * Every file under `directory` with its modification time.
 *
 * Recursive rather than expressed with array methods, for the same reason
 * as the payload scanner: the tree has to be walked before there is
 * anything to iterate.
 */
async function listFilesWithTimes(directory: string): Promise<FileTime[]> {
  const entries = await readDirectorySafely(directory)

  const nested = await Promise.all(
    entries.map(async (entry): Promise<FileTime[]> => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          return []
        }
        return listFilesWithTimes(entryPath)
      }

      if (!entry.isFile()) {
        return []
      }

      try {
        const stats = await stat(entryPath)
        return [{ filePath: entryPath, modifiedAt: stats.mtime }]
      } catch {
        return []
      }
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
