import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadWorkspaceEnv } from './env-file.js'
import { resolveWorkspaceRoot } from './workspace-root.js'

describe('loadWorkspaceEnv', () => {
  it('reports whether the workspace has a .env', () => {
    // Deliberately not asserting which: .env is gitignored, so it is
    // present on a developer's machine and absent in a fresh clone, and
    // a test that demanded either would fail somewhere real.
    expect(typeof loadWorkspaceEnv()).toBe('boolean')
  })

  it('resolves against the workspace root, not the cwd', () => {
    const root = resolveWorkspaceRoot(process.cwd())
    const fromNested = loadWorkspaceEnv(path.join(root, 'packages/shared/src'))

    expect(fromNested).toBe(loadWorkspaceEnv(root))
  })
})
