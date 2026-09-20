import { describe, expect, it } from 'vitest'

import {
  PAPER_41,
  knowledgeDocument,
  section,
  subTopic,
  topic,
} from '../test-fixtures'
import { chunkLearningObjectives } from './chunk-learning-objectives'

const SUB_TOPICS = [
  subTopic('1.5', 1, 'Forces', [
    section(
      '1.5.1',
      'Effects of forces',
      ['describe how forces may change the size of an object'],
      ['determine the resultant of two or more forces']
    ),
  ]),
]

const DOCUMENT = knowledgeDocument([], {
  paper: PAPER_41,
  topics: [topic(1, 'Motion, forces and energy')],
  subTopics: SUB_TOPICS,
})

describe('chunkLearningObjectives', () => {
  it('produces one chunk per objective, across core and supplement', () => {
    const chunks = chunkLearningObjectives(DOCUMENT, 'CAM-0625-SYLLABUS')

    expect(chunks).toHaveLength(2)
    expect(chunks.map((chunk) => chunk.metadata.tier)).toEqual([
      'core',
      'supplement',
    ])
  })

  it('heads each objective with its topic, sub-topic, section and tier', () => {
    const [core] = chunkLearningObjectives(DOCUMENT, 'CAM-0625-SYLLABUS')

    expect(core.content.split('\n')[0]).toBe(
      'Topic 1: Motion, forces and energy — 1.5 Forces — 1.5.1 Effects of forces — Core'
    )
    expect(core.content).toContain(
      'describe how forces may change the size of an object'
    )
  })

  it('keys objectives to the syllabus, not the paper they were read with', () => {
    // Twelve papers share one syllabus. Keying these by paper would embed
    // the same objectives twelve times and pay for it twelve times.
    const fromPaper11 = chunkLearningObjectives(
      knowledgeDocument([], {
        resourceId: 'CAM-0625-MJ-2024-11-QP',
        topics: DOCUMENT.topics,
        subTopics: SUB_TOPICS,
      }),
      'CAM-0625-SYLLABUS'
    )
    const fromPaper41 = chunkLearningObjectives(DOCUMENT, 'CAM-0625-SYLLABUS')

    expect(fromPaper11.map((c) => c.id)).toEqual(fromPaper41.map((c) => c.id))
    expect(fromPaper11[0].id).toBe(
      'CAM-0625-SYLLABUS:learningObjective:1.5.1.1'
    )
    expect(fromPaper11[0].sourceDocumentId).toBe('CAM-0625-SYLLABUS')
  })

  it('does not repeat a sub-topic name as its own section', () => {
    // A sub-topic that lists objectives directly gets one implicit
    // section carrying its own number and name — printing both would
    // read "1.5 Forces — 1.5 Forces".
    const implicit = knowledgeDocument([], {
      topics: [topic(1, 'Motion, forces and energy')],
      subTopics: [
        subTopic('1.5', 1, 'Forces', [
          section('1.5', 'Forces', ['state what is meant by mass']),
        ]),
      ],
    })

    const [chunk] = chunkLearningObjectives(implicit, 'CAM-0625-SYLLABUS')

    expect(chunk.content.split('\n')[0]).toBe(
      'Topic 1: Motion, forces and energy — 1.5 Forces — Core'
    )
  })

  it('carries the syllabus code, so a syllabus-scoped query can reach it', () => {
    // Without this, a filter of `syllabusCode: '0625'` excluded every
    // objective and retrieval silently fell back to finding exemplars
    // by filter alone — with no error, just worse results.
    const [chunk] = chunkLearningObjectives(DOCUMENT, 'CAM-0625-SYLLABUS')

    expect(chunk.metadata.syllabusCode).toBe('0625')
  })

  it('gives every objective a unique id', () => {
    const chunks = chunkLearningObjectives(DOCUMENT, 'CAM-0625-SYLLABUS')
    const ids = new Set(chunks.map((chunk) => chunk.id))

    expect(ids.size).toBe(chunks.length)
  })
})
