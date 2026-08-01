import type { ParsedDocument } from '@education-ai/document-ai'
import { reconstructLines } from '@education-ai/question-extraction'
import type { Line } from '@education-ai/question-extraction'

import type {
  AssessmentObjective,
  SyllabusOverview,
  SyllabusTopic,
} from '../types/syllabus-overview'

const EXTRACTOR_VERSION = '0.1.0'

// The syllabus's page footers ("6 www.cambridgeinternational.org/igcse
// Back to contents page") sit at a distinctly smaller x than body text
// (x≈17 vs x≈57) — without this, a footer starting with a valid topic
// number collides with the topic-number pattern. Confirmed against the
// real 0625 syllabus PDF.
const BODY_MARGIN_MIN = 50
const BODY_MARGIN_MAX = 65

const TOPIC_PATTERN = /^(\d)\s+(.+)$/
const AO_HEADING_PATTERN = /^(AO\d)\s+(.+)$/
const AO_WEIGHTING_ROW_PATTERN = /^(AO\d)\s+.+?\s+(\d+)$/
const BULLET_PATTERN = /^•\s*(.+)$/

const TOPICS_START_HEADING = 'Content overview'
const TOPICS_END_HEADINGS = ['Assessment overview']
const AO_START_HEADING = 'Assessment objectives'
const AO_END_HEADINGS = ['Weighting for assessment objectives']
const WEIGHTING_START_HEADING = 'Assessment objective Weighting in IGCSE %'
const WEIGHTING_END_HEADINGS = [
  'Assessment objectives as a percentage of each component',
]

/**
 * Extracts the topic list and assessment-objective definitions/weightings
 * from a Cambridge syllabus — the small, well-structured part. The full
 * ~30-page subject-content hierarchy (topic -> sub-topic -> Core/
 * Supplement learning objectives) is a separate, harder problem and isn't
 * covered here — see docs/learning-notes.
 */
export function buildSyllabusOverview(parsed: ParsedDocument): SyllabusOverview {
  const lines = parsed.pages.flatMap((page) => reconstructLines(page))

  return {
    metadata: {
      resourceId: parsed.metadata.resourceId,
      title: parsed.metadata.title,
      pageCount: parsed.metadata.pageCount,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    topics: extractTopics(lines),
    assessmentObjectives: extractAssessmentObjectives(lines),
  }
}

function extractTopics(lines: Line[]): SyllabusTopic[] {
  const section = sectionBetween(lines, TOPICS_START_HEADING, TOPICS_END_HEADINGS)

  return section.flatMap((line): SyllabusTopic[] => {
    if (!isBodyMargin(line)) {
      return []
    }
    const match = line.text.trim().match(TOPIC_PATTERN)
    return match ? [{ number: Number(match[1]), name: match[2].trim() }] : []
  })
}

function extractAssessmentObjectives(lines: Line[]): AssessmentObjective[] {
  const descriptionsSection = sectionBetween(lines, AO_START_HEADING, AO_END_HEADINGS)
  const drafts = buildAoDescriptions(descriptionsSection)

  const weightingsSection = sectionBetween(
    lines,
    WEIGHTING_START_HEADING,
    WEIGHTING_END_HEADINGS
  )
  const weightings = extractWeightings(weightingsSection)

  return drafts.map((draft) => ({
    ...draft,
    weightingPercent: weightings.get(draft.code),
  }))
}

interface AoDraft {
  code: string
  name: string
  description: string[]
}

function buildAoDescriptions(lines: Line[]): AoDraft[] {
  return lines.reduce<AoDraft[]>((drafts, line) => {
    if (!isBodyMargin(line)) {
      return drafts
    }
    const text = line.text.trim()

    const headingMatch = text.match(AO_HEADING_PATTERN)
    if (headingMatch) {
      return [
        ...drafts,
        { code: headingMatch[1], name: headingMatch[2].trim(), description: [] },
      ]
    }

    const current = drafts[drafts.length - 1]
    const bulletMatch = text.match(BULLET_PATTERN)
    if (bulletMatch && current) {
      const updated: AoDraft = {
        ...current,
        description: [...current.description, bulletMatch[1].trim()],
      }
      return [...drafts.slice(0, -1), updated]
    }

    return drafts
  }, [])
}

function extractWeightings(lines: Line[]): Map<string, number> {
  return lines.reduce((map, line) => {
    const match = line.text.trim().match(AO_WEIGHTING_ROW_PATTERN)
    return match ? new Map(map).set(match[1], Number(match[2])) : map
  }, new Map<string, number>())
}

function isBodyMargin(line: Line): boolean {
  return (
    line.boundingBox.x >= BODY_MARGIN_MIN && line.boundingBox.x <= BODY_MARGIN_MAX
  )
}

function sectionBetween(
  lines: Line[],
  startHeading: string,
  endHeadings: string[]
): Line[] {
  const startIndex = lines.findIndex((line) => line.text.trim() === startHeading)
  if (startIndex === -1) {
    return []
  }
  const after = lines.slice(startIndex + 1)
  const endIndex = after.findIndex((line) => endHeadings.includes(line.text.trim()))
  return endIndex === -1 ? after : after.slice(0, endIndex)
}
