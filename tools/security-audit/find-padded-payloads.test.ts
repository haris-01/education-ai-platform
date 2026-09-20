import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  findPaddedPayloads,
  findPaddedPayloadsInFile,
} from './find-padded-payloads'

// The real shape of the payload: a long run of spaces so the line reads as
// blank in an editor, then the implant on one line.
const PADDING = ' '.repeat(200)
const PAYLOAD = `/*M260630A*/${'a'.repeat(3000)}`

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'security-audit-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}

describe('findPaddedPayloads', () => {
  it('finds a payload appended after a run of spaces', async () => {
    // Exactly what was done to eslint.config.js: the real file left
    // intact, then padding, then the implant as one more line.
    await write('eslint.config.js', `export default []\n${PADDING}${PAYLOAD}`)

    const findings = await findPaddedPayloads(root)

    expect(findings).toHaveLength(1)
    expect(findings[0].lineNumber).toBe(2)
    expect(findings[0].paddingLength).toBe(200)
    expect(findings[0].lineLength).toBeGreaterThan(3000)
  })

  it('ignores a minified bundle, which is long but not padded', async () => {
    // The discriminator that makes this usable: node_modules is full of
    // enormous single-line files, and flagging them all would make the
    // check worthless.
    await write('node_modules/lib/bundle.min.js', 'x'.repeat(200_000))

    expect(await findPaddedPayloads(root)).toEqual([])
  })

  it('ignores padding on a short line', async () => {
    // Generated code and ASCII tables do contain long space runs; without
    // the length test those would be constant false positives.
    await write('table.js', `const t = [1,${PADDING}2]`)

    expect(await findPaddedPayloads(root)).toEqual([])
  })

  it('finds a payload inside node_modules', async () => {
    // The dependency tree is where this arrives, so it must be walked.
    await write(
      'node_modules/evil/index.js',
      `module.exports={}\n${PADDING}${PAYLOAD}`
    )

    const findings = await findPaddedPayloads(root)

    expect(findings).toHaveLength(1)
    expect(findings[0].filePath).toContain('node_modules/evil/index.js')
  })

  it('skips directories with nothing executable in them', async () => {
    await write('.git/objects/pack.js', `${PADDING}${PAYLOAD}`)
    await write('datasets/cached.json', `${PADDING}${PAYLOAD}`)

    expect(await findPaddedPayloads(root)).toEqual([])
  })

  it('ignores file types a payload cannot execute from', async () => {
    await write('notes.md', `${PADDING}${PAYLOAD}`)
    await write('data.csv', `${PADDING}${PAYLOAD}`)

    expect(await findPaddedPayloads(root)).toEqual([])
  })

  it('reports every payload when there is more than one', async () => {
    await write('a.js', `${PADDING}${PAYLOAD}`)
    await write('nested/b.cjs', `${PADDING}${PAYLOAD}`)

    expect(await findPaddedPayloads(root)).toHaveLength(2)
  })

  it('returns nothing for a clean tree', async () => {
    await write('index.ts', 'export const x = 1\n')
    await write('package.json', '{"name":"clean"}\n')

    expect(await findPaddedPayloads(root)).toEqual([])
  })

  it('returns nothing for a directory that does not exist', async () => {
    // An audit that throws on a missing path is an audit people stop
    // running.
    expect(await findPaddedPayloads(path.join(root, 'absent'))).toEqual([])
  })
})

describe('findPaddedPayloadsInFile', () => {
  // Used to qualify a timestamp finding. Without it, a file legitimately
  // repaired keeps a late modification date forever and the audit fails
  // permanently — which is how a check gets ignored.
  it('finds a payload in one named file', async () => {
    await write('cli.js', `module.exports = {}\n${PADDING}${PAYLOAD}`)

    const findings = await findPaddedPayloadsInFile(path.join(root, 'cli.js'))

    expect(findings).toHaveLength(1)
    expect(findings[0].lineNumber).toBe(2)
  })

  it('reports nothing for a repaired file, whatever its timestamp', async () => {
    // The real case: npm's cli.js after being truncated back to its
    // genuine 13 lines. Late mtime, clean contents.
    await write(
      'cli.js',
      "const validateEngines = require('./cli/validate-engines.js')\n"
    )

    expect(await findPaddedPayloadsInFile(path.join(root, 'cli.js'))).toEqual(
      []
    )
  })

  it('reports nothing for a file that does not exist', async () => {
    expect(await findPaddedPayloadsInFile(path.join(root, 'gone.js'))).toEqual(
      []
    )
  })
})
