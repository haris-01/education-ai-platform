import { existsSync } from 'node:fs'
import path from 'node:path'

import { resolveWorkspaceRoot } from './workspace-root.js'

// Loads the repository's `.env` into `process.env`, if there is one.
//
// Scripts get this from `tsx --env-file`. Vitest has no equivalent flag,
// and this repo has no vitest config anywhere — so without this, an
// opt-in suite that needs a credential silently skips even when the key
// is sitting in `.env`, which is a confusing way to find out.
//
// Returns whether a file was found, so a caller can say which it was.
export function loadWorkspaceEnv(startDir: string = process.cwd()): boolean {
  const envPath = path.join(resolveWorkspaceRoot(startDir), '.env')

  if (!existsSync(envPath)) {
    return false
  }

  process.loadEnvFile(envPath)

  return true
}
