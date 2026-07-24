import { paperCode } from '@education-ai/shared'

import { boardPrefix } from './board-prefix.js'
import type { DocumentResourceMetadata, DocumentType } from '../types.js'

const TYPE_ABBREVIATIONS: Record<DocumentType, string> = {
  SYLLABUS: 'SYL',
  QUESTION_PAPER: 'QP',
  MARK_SCHEME: 'MS',
  EXAMINER_REPORT: 'ER',
  CONFIDENTIAL_INSTRUCTIONS: 'CI',
  SPECIMEN_PAPER: 'QP',
  OTHER: 'OTH',
}

// Marks documents with no real exam session (specimen papers and their
// mark schemes/confidential instructions) so ids stay a consistent shape
// instead of omitting the slot.
const SPECIMEN_SESSION_CODE = 'SPC'

/**
 * Builds a stable, human-readable resource id, e.g. "CAM-0625-MJ-2024-41-QP"
 * or "CAM-0625-SYL-2026". Deterministic and immutable: a pure function of
 * `type` and `metadata` only (no titles, no timestamps, no ordering), so the
 * same document always produces the same id and it's safe to use as a
 * durable key once persisted.
 */
export function buildResourceId(
  type: DocumentType,
  metadata: DocumentResourceMetadata
): string {
  const prefix = [boardPrefix(metadata.board), metadata.syllabusCode]
  const yearPart = metadata.year !== undefined ? [String(metadata.year)] : []

  if (type === 'SYLLABUS') {
    return [...prefix, 'SYL', ...yearPart].join('-')
  }

  const paperPart =
    metadata.paper !== undefined
      ? [paperCode(metadata.paper, metadata.variant)]
      : []

  return [
    ...prefix,
    metadata.session ?? SPECIMEN_SESSION_CODE,
    ...yearPart,
    ...paperPart,
    TYPE_ABBREVIATIONS[type],
  ].join('-')
}
