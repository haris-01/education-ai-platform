import {
  createLogger,
  filenameFromUrl,
  paperCode,
  resolveWorkspaceRoot,
  slugify,
} from '@education-ai/shared'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DocumentResource, StoredDocument } from './types.js'

const logger = createLogger('store')

// Anchored to the monorepo root (not process.cwd()) so datasets/ always
// lands in the same place regardless of which directory the job is run from.
const WORKSPACE_ROOT = resolveWorkspaceRoot(
  path.dirname(fileURLToPath(import.meta.url))
)
const DATASETS_ROOT = path.join(WORKSPACE_ROOT, 'datasets')

/**
 * Predicts where a resource would land, without downloading it. The dataset
 * layout is fully deterministic (metadata -> directory, url -> filename), so
 * callers can check this path *before* calling `download()` and skip the
 * fetch entirely on a re-run instead of just skipping the re-write.
 */
export function resolveStoredPath(resource: DocumentResource): string {
  return path.join(resolveDirectory(resource), filenameFromUrl(resource.url))
}

/**
 * Stores a downloaded document at a deterministic path derived from its
 * metadata, alongside a metadata.json sidecar. Filesystem only, no database.
 */
export async function store(
  resource: DocumentResource,
  downloadedFilePath: string
): Promise<StoredDocument> {
  const directory = resolveDirectory(resource)
  await mkdir(directory, { recursive: true })

  const filename = path.basename(downloadedFilePath)
  const filePath = path.join(directory, filename)
  const metadataFilePath = path.join(
    directory,
    `${path.parse(filename).name}.metadata.json`
  )

  await copyFile(downloadedFilePath, filePath)
  await writeFile(metadataFilePath, JSON.stringify(resource, null, 2), 'utf-8')

  logger.info(`Stored ${filename} -> ${path.relative(process.cwd(), filePath)}`)

  return { resource, filePath, metadataFilePath }
}

function resolveDirectory(resource: DocumentResource): string {
  const { metadata } = resource

  const segments = [
    slugify(metadata.board),
    slugify(stripBoardPrefix(metadata.qualification)),
    slugify(metadata.subject),
    slugify(metadata.syllabusCode),
    ...categorySegments(resource),
  ]

  return path.join(DATASETS_ROOT, ...segments)
}

function stripBoardPrefix(qualification: string): string {
  return qualification.replace(/^cambridge\s+/i, '')
}

/**
 * Groups a document with its siblings from the same exam sitting (question
 * paper, mark scheme, confidential instructions, examiner report), keyed off
 * metadata rather than `type` alone — otherwise e.g. a specimen mark scheme
 * (type MARK_SCHEME) would be split away from its specimen question paper
 * (type SPECIMEN_PAPER), which share a title/year/paper but not a `type`.
 */
function categorySegments(resource: DocumentResource): string[] {
  const { type, title, metadata } = resource
  const yearSegment = metadata.year ? [String(metadata.year)] : []
  const paperSegment =
    metadata.paper !== undefined
      ? [paperCode(metadata.paper, metadata.variant)]
      : []

  if (type === 'SYLLABUS') {
    return ['syllabus']
  }

  if (type === 'SPECIMEN_PAPER' || /specimen/i.test(title)) {
    return ['specimen-papers', ...yearSegment, ...paperSegment]
  }

  if (
    metadata.session ||
    type === 'QUESTION_PAPER' ||
    type === 'MARK_SCHEME' ||
    type === 'EXAMINER_REPORT' ||
    type === 'CONFIDENTIAL_INSTRUCTIONS'
  ) {
    const sessionSegment = metadata.session
      ? [metadata.session.toLowerCase()]
      : []
    return ['past-papers', ...yearSegment, ...sessionSegment, ...paperSegment]
  }

  return ['other']
}
