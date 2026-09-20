import type { KnowledgeDocument } from '@education-ai/knowledge-builder'
import type {
  LearningObjective,
  SyllabusSection,
  SyllabusSubTopic,
  SyllabusTopic,
} from '@education-ai/syllabus-extraction'

import type { Chunk, SyllabusTier } from '../types/chunk'
import { createChunkId, hashContent } from './chunk-identity'
import { composeChunkText, topicLabel } from './compose-chunk-text'

// One chunk per syllabus learning objective — the statements of what a
// candidate must be able to do.
//
// These are scoped to the syllabus, not to a paper, so they take the
// syllabus's own resource id rather than the question paper's. Twelve
// papers share one syllabus: keying them by paper would embed the same
// 300-odd objectives twelve times and pay for it twelve times, then
// store twelve near-identical copies for a query to wade through.
export function chunkLearningObjectives(
  document: KnowledgeDocument,
  syllabusResourceId: string
): Chunk[] {
  const topicNames = new Map(
    document.topics.map((topic: SyllabusTopic) => [topic.number, topic.name])
  )

  return document.subTopics.flatMap((subTopic) =>
    subTopic.sections.flatMap((section) =>
      chunkSection(
        section,
        subTopic,
        topicNames,
        syllabusResourceId,
        document.metadata.paper?.syllabusCode
      )
    )
  )
}

function chunkSection(
  section: SyllabusSection,
  subTopic: SyllabusSubTopic,
  topicNames: Map<number, string>,
  syllabusResourceId: string,
  syllabusCode: string | undefined
): Chunk[] {
  const core = section.core.map((objective) =>
    buildObjectiveChunk(
      objective,
      'core',
      section,
      subTopic,
      topicNames,
      syllabusResourceId,
      syllabusCode
    )
  )

  const supplement = section.supplement.map((objective) =>
    buildObjectiveChunk(
      objective,
      'supplement',
      section,
      subTopic,
      topicNames,
      syllabusResourceId,
      syllabusCode
    )
  )

  return [...core, ...supplement]
}

function buildObjectiveChunk(
  objective: LearningObjective,
  tier: SyllabusTier,
  section: SyllabusSection,
  subTopic: SyllabusSubTopic,
  topicNames: Map<number, string>,
  syllabusResourceId: string,
  syllabusCode: string | undefined
): Chunk {
  const content = composeChunkText(
    [
      topicLabel(subTopic.topicNumber, topicNames.get(subTopic.topicNumber)),
      `${subTopic.number} ${subTopic.name}`,
      sectionLabel(section, subTopic),
      tierLabel(tier),
    ],
    objective.text
  )

  return {
    // Core and Supplement share one number sequence within a section, so
    // the section number plus the objective number is already unique —
    // the tier is in the content, not the key.
    id: createChunkId(
      syllabusResourceId,
      'learningObjective',
      `${section.number}.${objective.number}`
    ),
    chunkType: 'learningObjective',
    sourceDocumentId: syllabusResourceId,
    content,
    contentHash: hashContent(content),
    metadata: {
      // An objective belongs to the syllabus it was printed in, so any
      // syllabus-scoped query has to be able to reach it. Without this
      // a filter of `syllabusCode: '0625'` excluded every objective and
      // silently fell back to retrieving exemplars by filter alone.
      syllabusCode,
      topicNumber: subTopic.topicNumber,
      topicName: topicNames.get(subTopic.topicNumber),
      subTopicNumber: subTopic.number,
      sectionNumber: section.number,
      tier,
      assessmentObjectives: [],
      hasDiagram: false,
      isExemplar: true,
    },
    payload: {},
  }
}

// A sub-topic with no numbered sections of its own gets one implicit
// section carrying the sub-topic's own number and name — repeating that
// in the header would read "1.5 Forces — 1.5 Forces".
function sectionLabel(
  section: SyllabusSection,
  subTopic: SyllabusSubTopic
): string | undefined {
  if (section.number === subTopic.number) {
    return undefined
  }

  return `${section.number} ${section.name}`
}

function tierLabel(tier: SyllabusTier): string {
  if (tier === 'supplement') {
    return 'Supplement'
  }

  return 'Core'
}
