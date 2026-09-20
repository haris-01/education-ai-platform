import type { ParsedDocument } from '@education-ai/document-ai'
import { reconstructLines } from '@education-ai/question-extraction'
import type { Line } from '@education-ai/question-extraction'

import type {
  AssessmentObjective,
  CommandWord,
  SyllabusOverview,
  SyllabusTopic,
} from '../types/syllabus-overview'
import { extractSubTopics } from './extract-sub-topics'

const EXTRACTOR_VERSION = '0.3.0'

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

// The command-words table's header row. Everything about that table is
// measured from this line rather than from fixed x values: the table sits
// at its own left margin (x~63), a little right of body text (x~57), and
// wrapped meanings are indented much further (x~159). Reading those
// offsets off the header keeps the extractor working if a future syllabus
// shifts its margins.
const COMMAND_WORD_HEADER = 'Command word What it means'
const COMMAND_WORD_ROW_PATTERN = /^([A-Z][a-z]+)\s+(.+)$/
const COMMAND_WORD_MARGIN_TOLERANCE_PX = 3
const COMMAND_WORD_CONTINUATION_INDENT_PX = 20

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
export function buildSyllabusOverview(
  parsed: ParsedDocument
): SyllabusOverview {
  const lines = parsed.pages.flatMap((page) => reconstructLines(page))
  const topics = extractTopics(lines)

  return {
    metadata: {
      resourceId: parsed.metadata.resourceId,
      title: parsed.metadata.title,
      pageCount: parsed.metadata.pageCount,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    topics,
    assessmentObjectives: extractAssessmentObjectives(lines),
    commandWords: extractCommandWords(lines),
    subTopics: extractSubTopics(parsed, topics),
  }
}

function extractTopics(lines: Line[]): SyllabusTopic[] {
  const section = sectionBetween(
    lines,
    TOPICS_START_HEADING,
    TOPICS_END_HEADINGS
  )

  return section.flatMap((line): SyllabusTopic[] => {
    if (!isBodyMargin(line)) {
      return []
    }
    const match = line.text.trim().match(TOPIC_PATTERN)
    return match ? [{ number: Number(match[1]), name: match[2].trim() }] : []
  })
}

function extractAssessmentObjectives(lines: Line[]): AssessmentObjective[] {
  const descriptionsSection = sectionBetween(
    lines,
    AO_START_HEADING,
    AO_END_HEADINGS
  )
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
        {
          code: headingMatch[1],
          name: headingMatch[2].trim(),
          description: [],
        },
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
    line.boundingBox.x >= BODY_MARGIN_MIN &&
    line.boundingBox.x <= BODY_MARGIN_MAX
  )
}

function sectionBetween(
  lines: Line[],
  startHeading: string,
  endHeadings: string[]
): Line[] {
  const startIndex = lines.findIndex(
    (line) => line.text.trim() === startHeading
  )
  if (startIndex === -1) {
    return []
  }
  const after = lines.slice(startIndex + 1)
  const endIndex = after.findIndex((line) =>
    endHeadings.includes(line.text.trim())
  )
  return endIndex === -1 ? after : after.slice(0, endIndex)
}

function extractCommandWords(lines: Line[]): CommandWord[] {
  const headerIndex = lines.findIndex(
    (line) => line.text.trim() === COMMAND_WORD_HEADER
  )
  if (headerIndex === -1) {
    return []
  }

  const tableX = lines[headerIndex].boundingBox.x
  const rows = takeWhileInTable(lines.slice(headerIndex + 1), tableX)

  return rows.reduce<CommandWord[]>((words, line) => {
    const text = line.text.trim()
    const isContinuation =
      line.boundingBox.x > tableX + COMMAND_WORD_CONTINUATION_INDENT_PX
    const current = words[words.length - 1]

    if (isContinuation) {
      if (!current) {
        return words
      }
      const joined: CommandWord = {
        ...current,
        meaning: `${current.meaning} ${text}`,
      }
      return [...words.slice(0, -1), joined]
    }

    const match = text.match(COMMAND_WORD_ROW_PATTERN)
    if (!match) {
      return words
    }

    return [...words, { word: match[1], meaning: match[2].trim() }]
  }, [])
}

// The table ends where the text steps back out to the body/footer margin.
// Cambridge puts no heading after it — the next thing on the page is the
// page footer — so there is no end-heading to look for.
function takeWhileInTable(lines: Line[], tableX: number): Line[] {
  const endIndex = lines.findIndex(
    (line) => line.boundingBox.x < tableX - COMMAND_WORD_MARGIN_TOLERANCE_PX
  )
  return endIndex === -1 ? lines : lines.slice(0, endIndex)
}
