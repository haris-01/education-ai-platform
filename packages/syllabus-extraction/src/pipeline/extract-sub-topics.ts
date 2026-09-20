import type { Page, ParsedDocument } from '@education-ai/document-ai'
import { slicePageColumn } from '@education-ai/document-ai'
import { reconstructLines } from '@education-ai/question-extraction'
import type { Line } from '@education-ai/question-extraction'

import type {
  LearningObjective,
  SyllabusSubTopic,
  SyllabusTopic,
} from '../types/syllabus-overview'

// The subject content is three levels deep, and both heading levels are
// reprinted with a "continued" suffix when they run past a page break:
//
//   1.5 Forces
//   1.5.1 Effects of forces
//   1.5 Forces continued
//   1.5.1 Effects of forces continued
//   1.5.2 Turning effect of forces
//
// The section level is what makes this worth modelling: objective
// numbering restarts at each section, so flattening 1.5 into one list
// produces "1,2,3,4,5,6,7,8,1,2,3,4,1,2,3".
const SECTION_PATTERN = /^(\d+\.\d+\.\d+)\s+(.+?)(?:\s+continued)?$/
const SUB_TOPIC_PATTERN = /^(\d+)\.(\d+)\s+(.+?)(?:\s+continued)?$/

// "1 Define speed as distance travelled per unit time; ...". Numbered
// continuously within a section, Core and Supplement sharing one
// sequence — the Supplement column of a section whose Core runs 1-8
// starts at 9.
const OBJECTIVE_PATTERN = /^(\d{1,2})\s+(.+)$/

const COLUMN_HEADER_SUPPLEMENT = 'Supplement'
const COLUMN_HEADER_CORE = 'Core'

// Printed alone in the table header of a page a sub-topic runs onto.
const CONTINUED_MARKER = 'continued'

// How far left of the Supplement column the split is drawn. Core
// objectives wrap to x~79 and their inline equations reach x~165, so the
// cut has to clear those while staying left of the Supplement column
// itself at x~309.
const COLUMN_SPLIT_MARGIN_PX = 20

// A heading or objective sits at its column's left margin; anything
// further right is the continuation of the line above it. Checked as a
// distance, not a ceiling: a line well to the LEFT of the margin is not
// at it either.
const CONTINUATION_INDENT_PX = 8

// The running head and the page footer repeat on every page. The footer
// is the dangerous one: it begins with the page number ("10
// www.cambridgeinternational.org/igcse Back to contents page"), so it
// reads as a numbered objective. Filtered by position, the same approach
// examiner-report-extraction uses for its boilerplate.
const PAGE_HEADER_MAX_Y = 45
const PAGE_FOOTER_MIN_Y = 795

type ColumnKind = 'core' | 'supplement'

interface ColumnLine {
  line: Line
  column: ColumnKind
  marginX: number
}

/**
 * Extracts the syllabus's subject-content hierarchy: each sub-topic, its
 * sections, and each section's numbered Core and Supplement learning
 * objectives.
 *
 * The work here is layout, not text. These pages are a two-column table,
 * and reconstructing lines across the whole width glues a Core objective
 * to whichever unrelated Supplement objective happens to sit at the same
 * height ("3 Recall and use the equation 9 Define acceleration as change
 * in velocity per unit"). Each page is therefore sliced into its two
 * columns first, and lines are reconstructed within each slice.
 *
 * Returns an empty list for a document with no such table, so a syllabus
 * in a different format degrades to "no sub-topics" rather than to
 * garbage.
 */
export function extractSubTopics(
  parsed: ParsedDocument,
  topics: SyllabusTopic[] = []
): SyllabusSubTopic[] {
  const splitX = findColumnSplitX(parsed)
  if (splitX === undefined) {
    return []
  }

  const columnLines = parsed.pages
    .filter((page) => isSubjectContentPage(page, splitX))
    .flatMap((page) => readColumns(page, splitX))

  return assembleSubTopics(columnLines, topicHeadings(topics))
}

// A new topic opens with its own heading ("2 Thermal physics"), which is
// indistinguishable from a numbered objective by pattern alone — both are
// a number, a space and a phrase. Matching against the topic list already
// extracted from the contents page settles it exactly, instead of
// guessing from length or capitalisation.
function topicHeadings(topics: SyllabusTopic[]): Set<string> {
  return new Set(topics.map((topic) => `${topic.number} ${topic.name}`))
}

// The split is measured from the "Supplement" column header rather than
// hardcoded, so a syllabus that shifts its margins still works. The
// document's other two-column tables (the mathematical-requirements pages)
// use a different, wider layout, so the position shared by the most pages
// is the subject-content one.
function findColumnSplitX(parsed: ParsedDocument): number | undefined {
  const headerXs = parsed.pages.flatMap((page) =>
    page.textElements
      .filter((element) => element.text.trim() === COLUMN_HEADER_SUPPLEMENT)
      .map((element) => Math.round(element.boundingBox.x))
  )

  if (headerXs.length === 0) {
    return undefined
  }

  const modalX = mostCommon(headerXs)

  return modalX === undefined ? undefined : modalX - COLUMN_SPLIT_MARGIN_PX
}

function isSubjectContentPage(page: Page, splitX: number): boolean {
  return page.textElements.some(
    (element) =>
      element.text.trim() === COLUMN_HEADER_SUPPLEMENT &&
      element.boundingBox.x >= splitX
  )
}

// Both columns of one page, interleaved by vertical position so that a
// heading part-way down the page correctly closes what came above it in
// both columns.
function readColumns(page: Page, splitX: number): ColumnLine[] {
  const core = reconstructLines(slicePageColumn(page, { maxX: splitX })).filter(
    isBodyLine
  )
  const supplement = reconstructLines(
    slicePageColumn(page, { minX: splitX })
  ).filter(isBodyLine)

  const coreMarginX = leftMarginOf(core)
  const supplementMarginX = leftMarginOf(supplement)

  const tagged: ColumnLine[] = [
    ...core.map((line) => ({
      line,
      column: 'core' as const,
      marginX: coreMarginX,
    })),
    ...supplement.map((line) => ({
      line,
      column: 'supplement' as const,
      marginX: supplementMarginX,
    })),
  ]

  return [...tagged].sort((a, b) => a.line.boundingBox.y - b.line.boundingBox.y)
}

function isBodyLine(line: Line): boolean {
  return (
    line.boundingBox.y > PAGE_HEADER_MAX_Y &&
    line.boundingBox.y < PAGE_FOOTER_MIN_Y
  )
}

// The column's left margin is the position most of its numbered items
// share, not the leftmost one — see the page-footer note above.
function leftMarginOf(lines: Line[]): number {
  const xs = lines
    .filter((line) => OBJECTIVE_PATTERN.test(line.text.trim()))
    .map((line) => Math.round(line.boundingBox.x))

  return mostCommon(xs) ?? Infinity
}

function mostCommon(values: number[]): number | undefined {
  const counts = values.reduce<Record<number, number>>(
    (acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }),
    {}
  )

  const ranked = Object.entries(counts).sort(([, a], [, b]) => b - a)

  return ranked.length > 0 ? Number(ranked[0][0]) : undefined
}

interface SectionDraft {
  number: string
  name: string
  core: LearningObjective[]
  supplement: LearningObjective[]
}

interface SubTopicDraft {
  number: string
  topicNumber: number
  name: string
  sections: SectionDraft[]
}

function assembleSubTopics(
  columnLines: ColumnLine[],
  topicHeadingLines: Set<string>
): SyllabusSubTopic[] {
  return columnLines.reduce<SubTopicDraft[]>(
    (drafts, entry) => reduceLine(drafts, entry, topicHeadingLines),
    []
  )
}

function reduceLine(
  drafts: SubTopicDraft[],
  entry: ColumnLine,
  topicHeadingLines: Set<string>
): SubTopicDraft[] {
  const text = entry.line.text.trim()
  if (text === '' || isColumnHeader(text) || text === CONTINUED_MARKER) {
    return drafts
  }

  if (topicHeadingLines.has(text)) {
    return drafts
  }

  // Equations wrap onto their own line and can look exactly like a
  // heading ("9.8 m/s 2"), so position decides what a line may be before
  // its text is consulted at all.
  const isAtMargin =
    Math.abs(entry.line.boundingBox.x - entry.marginX) <= CONTINUATION_INDENT_PX

  if (!isAtMargin) {
    return withLast(drafts, (draft) =>
      appendContinuation(draft, entry.column, text)
    )
  }

  // Headings only ever appear in the Core column.
  if (entry.column === 'core') {
    const heading = readHeading(text)
    if (heading) {
      return applyHeading(drafts, heading)
    }
  }

  const objectiveMatch = text.match(OBJECTIVE_PATTERN)
  if (objectiveMatch) {
    return withLast(drafts, (draft) =>
      addObjective(draft, entry.column, {
        number: Number(objectiveMatch[1]),
        text: objectiveMatch[2].trim(),
      })
    )
  }

  return withLast(drafts, (draft) =>
    appendContinuation(draft, entry.column, text)
  )
}

type Heading =
  | { kind: 'subTopic'; number: string; topicNumber: number; name: string }
  | { kind: 'section'; number: string; name: string }

// The section pattern is tried first because it is the more specific of
// the two: "1.5.1 Effects of forces" would otherwise be read as
// sub-topic "1.5" with the name "1 Effects of forces".
function readHeading(text: string): Heading | undefined {
  const sectionMatch = text.match(SECTION_PATTERN)
  if (sectionMatch) {
    return {
      kind: 'section',
      number: sectionMatch[1],
      name: sectionMatch[2].trim(),
    }
  }

  const subTopicMatch = text.match(SUB_TOPIC_PATTERN)
  if (subTopicMatch) {
    return {
      kind: 'subTopic',
      number: `${subTopicMatch[1]}.${subTopicMatch[2]}`,
      topicNumber: Number(subTopicMatch[1]),
      name: subTopicMatch[3].trim(),
    }
  }

  return undefined
}

// Headings reprinted after a page break carry a "continued" suffix, which
// the patterns strip — so a repeat arrives here identical to the original
// and is recognised by number rather than re-opened.
function applyHeading(
  drafts: SubTopicDraft[],
  heading: Heading
): SubTopicDraft[] {
  if (heading.kind === 'subTopic') {
    if (lastOf(drafts)?.number === heading.number) {
      return drafts
    }

    return [
      ...drafts,
      {
        number: heading.number,
        topicNumber: heading.topicNumber,
        name: heading.name,
        sections: [],
      },
    ]
  }

  return withLast(drafts, (draft) => {
    if (lastOf(draft.sections)?.number === heading.number) {
      return draft
    }

    return {
      ...draft,
      sections: [
        ...draft.sections,
        {
          number: heading.number,
          name: heading.name,
          core: [],
          supplement: [],
        },
      ],
    }
  })
}

function isColumnHeader(text: string): boolean {
  return text === COLUMN_HEADER_CORE || text === COLUMN_HEADER_SUPPLEMENT
}

function addObjective(
  draft: SubTopicDraft,
  column: ColumnKind,
  objective: LearningObjective
): SubTopicDraft {
  return withOpenSection(draft, (section) => ({
    ...section,
    [column]: [...section[column], objective],
  }))
}

// A wrapped line belongs to the objective above it, in the same column.
// Dropped when that column has no objective open yet — stray text above
// the first numbered item is table furniture, not content.
function appendContinuation(
  draft: SubTopicDraft,
  column: ColumnKind,
  text: string
): SubTopicDraft {
  const section = lastOf(draft.sections)
  if (!section) {
    return draft
  }

  const objectives = section[column]
  const last = lastOf(objectives)
  if (!last) {
    return draft
  }

  const joined: LearningObjective = { ...last, text: `${last.text} ${text}` }

  return withOpenSection(draft, (open) => ({
    ...open,
    [column]: [...objectives.slice(0, -1), joined],
  }))
}

// Most sub-topics are divided into numbered sections, but the simpler
// ones (1.1 Physical quantities, 1.6 Momentum) list their objectives
// directly. Those get one implicit section carrying the sub-topic's own
// number and name, so every consumer can iterate sections uniformly
// instead of handling two shapes.
function withOpenSection(
  draft: SubTopicDraft,
  update: (section: SectionDraft) => SectionDraft
): SubTopicDraft {
  const sections =
    draft.sections.length > 0
      ? draft.sections
      : [{ number: draft.number, name: draft.name, core: [], supplement: [] }]

  return {
    ...draft,
    sections: [...sections.slice(0, -1), update(sections[sections.length - 1])],
  }
}

function withLast(
  drafts: SubTopicDraft[],
  update: (draft: SubTopicDraft) => SubTopicDraft
): SubTopicDraft[] {
  const last = lastOf(drafts)
  if (!last) {
    return drafts
  }

  return [...drafts.slice(0, -1), update(last)]
}

function lastOf<T>(values: T[]): T | undefined {
  return values[values.length - 1]
}
