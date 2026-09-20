import { describe, expect, it } from 'vitest'

import {
  part,
  question,
  questionDocument,
  syllabusOverview,
  topic,
} from '../test-fixtures'
import { assignTopics } from './assign-topics'

const SYLLABUS = syllabusOverview([
  topic(1, 'Motion, forces and energy'),
  topic(2, 'Thermal physics'),
  topic(3, 'Waves'),
  topic(4, 'Electricity and magnetism'),
  topic(5, 'Nuclear physics'),
  topic(6, 'Space physics'),
])

describe('assignTopics', () => {
  it('assigns a question to the topic whose keywords score highest', () => {
    const doc = questionDocument([
      question(1, 'Calculate the acceleration of the vehicle.', {
        parts: [part('a', 'The resultant force acting on the mass is 20 N.')],
      }),
    ])

    const { assignments } = assignTopics(doc, SYLLABUS)

    expect(assignments).toHaveLength(1)
    expect(assignments[0]).toMatchObject({
      questionNumber: 1,
      topicNumber: 1,
      topicName: 'Motion, forces and energy',
    })
    expect(assignments[0].matchedKeywords).toEqual(
      expect.arrayContaining(['acceleration', 'resultant force', 'mass'])
    )
  })

  it('leaves a question unclassified when no keyword matches', () => {
    const doc = questionDocument([
      question(1, 'Describe the experimental procedure used by the student.'),
    ])

    const { assignments } = assignTopics(doc, SYLLABUS)

    expect(assignments[0]).toEqual({ questionNumber: 1, matchedKeywords: [] })
  })

  it('leaves a question unclassified when two topics tie', () => {
    // "magnet" (electricity and magnetism) and "star" (space physics) each
    // score exactly one hit — an arbitrary pick would be a wrong guess.
    const doc = questionDocument([
      question(1, 'A magnet is placed near a star.'),
    ])

    const { assignments } = assignTopics(doc, SYLLABUS)

    expect(assignments[0].topicNumber).toBeUndefined()
    expect(assignments[0].matchedKeywords).toEqual([])
  })

  it('reads text from parts, sub-parts, and MCQ options', () => {
    const doc = questionDocument([
      question(1, 'Which statement about waves is correct?', {
        options: [
          { label: 'A', text: 'The wavelength increases with frequency.' },
          { label: 'B', text: 'Sound cannot travel through a vacuum.' },
        ],
      }),
    ])

    const { assignments } = assignTopics(doc, SYLLABUS)

    expect(assignments[0]).toMatchObject({
      topicNumber: 3,
      topicName: 'Waves',
    })
  })

  it('returns unclassified assignments when the syllabus has no topics', () => {
    const doc = questionDocument([question(1, 'Calculate the acceleration.')])

    const { assignments } = assignTopics(doc, syllabusOverview([]))

    expect(assignments[0]).toEqual({ questionNumber: 1, matchedKeywords: [] })
  })
})
