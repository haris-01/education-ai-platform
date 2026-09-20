import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { findModifiedAfterInstall } from './find-modified-after-install.js'
import type { ModifiedAfterInstallFinding } from './find-modified-after-install.js'
import {
  findPaddedPayloads,
  findPaddedPayloadsInFile,
} from './find-padded-payloads.js'
import type { PaddedPayloadFinding } from './find-padded-payloads.js'

const run = promisify(execFile)

// Where npm keeps the file that every `npm` and `npx` command loads. This
// is the file that was patched in the September 2026 incident, and the
// reason a compromise survived reinstalling nothing and restarting
// everything.
function npmInstallRoot(): string {
  return path.resolve(
    process.execPath,
    '..',
    '..',
    'lib',
    'node_modules',
    'npm'
  )
}

/**
 * Runs the checks that would have caught the September 2026 compromise,
 * over this repository and the npm installation running it.
 *
 * Deliberately narrow. This is not a virus scanner and will not pretend to
 * be one — it tests for two specific shapes that malware of this family
 * cannot avoid, and stays quiet otherwise so that noise never trains
 * anyone to skip it. See docs/security/ for what it is modelled on.
 */
export async function auditSecurity(repositoryRoot: string): Promise<number> {
  const padded = await findPaddedPayloads(repositoryRoot)
  reportPadded(padded)

  const tampered = await qualify(
    await findModifiedAfterInstall(npmInstallRoot())
  )
  reportTampered(tampered)

  const signature = await verifyEditorSignature()
  reportSignature(signature)

  // A timestamp on its own is a prompt, not a problem: a repaired or
  // hand-patched file keeps a late date forever. Only a late file that
  // also *looks* wrong counts towards the exit code, so that a legitimate
  // repair does not leave the audit failing permanently — which is the
  // surest way to get it ignored.
  const failures =
    padded.length +
    tampered.filter((entry) => entry.carriesPayload).length +
    (signature === 'invalid' ? 1 : 0)

  console.info('')
  console.info(
    failures === 0
      ? 'security audit: nothing found'
      : `security audit: ${failures} thing(s) to look at`
  )

  return failures === 0 ? 0 : 1
}

function reportPadded(findings: PaddedPayloadFinding[]) {
  console.info('space-padded payload lines')
  if (findings.length === 0) {
    console.info('  none')
    return
  }

  findings.forEach((finding) => {
    console.error(
      `  ${finding.filePath}:${finding.lineNumber} — ${finding.lineLength.toLocaleString()} chars after ${finding.paddingLength} spaces`
    )
  })
}

// A timestamp finding, plus whether the file's contents look wrong too.
interface QualifiedFinding extends ModifiedAfterInstallFinding {
  carriesPayload: boolean
}

async function qualify(
  findings: ModifiedAfterInstallFinding[]
): Promise<QualifiedFinding[]> {
  return Promise.all(
    findings.map(async (finding) => ({
      ...finding,
      carriesPayload:
        (await findPaddedPayloadsInFile(finding.filePath)).length > 0,
    }))
  )
}

function reportTampered(findings: QualifiedFinding[]) {
  console.info('')
  console.info('npm files modified after install')
  if (findings.length === 0) {
    console.info('  none')
    return
  }

  findings.forEach((finding) => {
    const detail = `${finding.filePath} — ${finding.hoursLater}h after the rest of the install`

    if (finding.carriesPayload) {
      console.error(`  ${detail}`)
      console.error('    AND carries a space-padded payload line')
      return
    }

    console.info(`  ${detail}`)
    console.info('    contents look clean — expected after a repair or rebuild')
  })
}

type SignatureResult = 'valid' | 'invalid' | 'unavailable'

// The check that found the patched VS Code. A modified app bundle breaks
// the seal, whatever the modification looks like inside.
async function verifyEditorSignature(): Promise<SignatureResult> {
  if (process.platform !== 'darwin') {
    return 'unavailable'
  }

  try {
    await run('codesign', [
      '--verify',
      '--deep',
      '--strict',
      '/Applications/Visual Studio Code.app',
    ])
    return 'valid'
  } catch (error) {
    // A missing app and a broken seal both reject; only the latter is a
    // finding, and codesign says which on stderr.
    const stderr = String((error as { stderr?: string }).stderr ?? '')
    return stderr.includes('No such file') ? 'unavailable' : 'invalid'
  }
}

function reportSignature(result: SignatureResult) {
  console.info('')
  console.info('VS Code code signature')
  if (result === 'valid') {
    console.info('  intact')
    return
  }
  if (result === 'unavailable') {
    console.info('  not checked (not macOS, or VS Code not installed)')
    return
  }

  console.error('  BROKEN — the app bundle has been modified since signing')
  console.error(
    '  run: codesign --verify --deep --strict --verbose=4 "/Applications/Visual Studio Code.app"'
  )
}
