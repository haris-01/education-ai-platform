import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { auditSecurity } from './index.js'

// tools/security-audit/cli.ts -> the repository root.
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
)

auditSecurity(repositoryRoot)
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
