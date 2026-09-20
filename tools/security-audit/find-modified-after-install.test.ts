import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findModifiedAfterInstall } from './find-modified-after-install'

const INSTALL_TIME = new Date('2026-07-29T03:03:20Z')
// npm's cli.js was patched weeks after the install it belonged to.
const TAMPER_TIME = new Date('2026-09-15T02:24:32Z')

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'install-audit-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeAt(
  relativePath: string,
  modifiedAt: Date,
  content = 'x'
): Promise<void> {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
  await utimes(target, modifiedAt, modifiedAt)
}

async function writeInstalledTree(): Promise<void> {
  // A package written to disk in one go: every file shares a timestamp.
  await writeAt('package.json', INSTALL_TIME)
  await writeAt('lib/entry.js', INSTALL_TIME)
  await writeAt('lib/util.js', INSTALL_TIME)
  await writeAt('bin/run.js', INSTALL_TIME)
  await writeAt('docs/readme.js', INSTALL_TIME)
}

describe('findModifiedAfterInstall', () => {
  it('finds the one file modified long after the install', async () => {
    // This is the real signal from the September 2026 incident: npm's
    // cli.js was the only file in the whole installation with a later
    // date than its neighbours.
    await writeInstalledTree()
    await writeAt('lib/cli.js', TAMPER_TIME)

    const findings = await findModifiedAfterInstall(root)

    expect(findings).toHaveLength(1)
    expect(findings[0].filePath).toContain('lib/cli.js')
    expect(findings[0].hoursLater).toBeGreaterThan(24)
  })

  it('reports nothing when the whole tree shares a timestamp', async () => {
    await writeInstalledTree()

    expect(await findModifiedAfterInstall(root)).toEqual([])
  })

  it('tolerates the spread of a single install', async () => {
    // Files written minutes apart during one install must not be flagged,
    // or the check is noise.
    await writeInstalledTree()
    await writeAt('lib/late.js', new Date(INSTALL_TIME.getTime() + 90_000))

    expect(await findModifiedAfterInstall(root)).toEqual([])
  })

  it('uses the median, so one ancient file cannot hide a tamper', async () => {
    // A mean would be dragged by an outlier far enough to mask the real
    // one. The median is unmoved by it.
    await writeInstalledTree()
    await writeAt('lib/vendored.js', new Date('2019-01-01T00:00:00Z'))
    await writeAt('lib/cli.js', TAMPER_TIME)

    const findings = await findModifiedAfterInstall(root)

    expect(findings.map((f) => path.basename(f.filePath))).toContain('cli.js')
  })

  it('returns nothing for an empty or missing directory', async () => {
    expect(await findModifiedAfterInstall(path.join(root, 'absent'))).toEqual(
      []
    )
    expect(await findModifiedAfterInstall(root)).toEqual([])
  })
})
