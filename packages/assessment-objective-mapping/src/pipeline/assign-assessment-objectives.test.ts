import { describe, expect, it } from 'vitest'

import {
  options,
  paper,
  part,
  question,
  questionDocument,
  subPart,
  syllabusOverview,
} from '../test-fixtures'
import { assignAssessmentObjectives } from './assign-assessment-objectives'

const syllabus = syllabusOverview()

function assign(
  questions: Parameters<typeof questionDocument>[0],
  paperIdentity?: ReturnType<typeof paper>
) {
  return assignAssessmentObjectives(
    questionDocument(questions, paperIdentity),
    syllabus
  ).assignments
}

describe('assignAssessmentObjectives', () => {
  describe('the paper-level rule', () => {
    it('assigns AO3 to every question on the practical test (paper 5)', () => {
      const [assignment] = assign(
        [question(1, 'Calculate the average value.', { marks: 4 })],
        paper(5, 1)
      )

      // The syllabus weights papers 5 and 6 at 100% AO3, so the command
      // word must not be allowed to override it to AO2.
      expect(assignment.objectives).toEqual(['AO3'])
      expect(assignment.primaryObjective).toBe('AO3')
      expect(assignment.marksByObjective).toEqual({ AO3: 4 })
    })

    it('assigns AO3 on the alternative to practical (paper 6)', () => {
      const [assignment] = assign(
        [question(1, 'Describe the method.', { marks: 3 })],
        paper(6, 1)
      )

      expect(assignment.objectives).toEqual(['AO3'])
    })

    it('never assigns AO3 on a theory paper', () => {
      const assignments = assign(
        [
          question(1, 'Describe the motion of the ball.', { marks: 2 }),
          question(2, 'Calculate the resultant force.', { marks: 3 }),
        ],
        paper(4, 1)
      )

      assignments.forEach((assignment) => {
        expect(assignment.objectives).not.toContain('AO3')
      })
    })

    it('records the paper rule as evidence with no command word', () => {
      const [assignment] = assign([question(1, 'Anything.')], paper(5))

      expect(assignment.evidence).toEqual([
        { code: 'AO3', signal: 'paper', marks: undefined },
      ])
    })
  })

  describe('command words', () => {
    it('reads recall commands as AO1', () => {
      const [assignment] = assign(
        [question(1, 'Define acceleration.', { marks: 1 })],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual(['AO1'])
      expect(assignment.evidence[0]).toEqual({
        code: 'AO1',
        signal: 'command-word',
        location: undefined,
        commandWord: 'Define',
        marks: 1,
      })
    })

    it('reads problem-solving commands as AO2', () => {
      const [assignment] = assign(
        [question(1, 'Calculate the resultant force.', { marks: 3 })],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual(['AO2'])
      expect(assignment.primaryObjective).toBe('AO2')
    })

    it('scores each part separately so one question can assess both', () => {
      // The shape of a real theory question: a definition followed by a
      // calculation. Flattening the question to one blob of text would
      // report only whichever command word happened to come first.
      const [assignment] = assign(
        [
          question(1, 'A ball falls through oil.', {
            parts: [
              part('a', 'Define acceleration.', { marks: 1 }),
              part('b', 'Calculate the resultant force.', { marks: 3 }),
            ],
          }),
        ],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual(['AO1', 'AO2'])
      expect(assignment.marksByObjective).toEqual({ AO1: 1, AO2: 3 })
      expect(assignment.primaryObjective).toBe('AO2')
    })

    it('labels sub-part evidence the way the exam does', () => {
      const [assignment] = assign(
        [
          question(1, 'A circuit is shown.', {
            parts: [
              part('b', 'Use the diagram.', {
                subParts: [
                  subPart('i', 'State the unit of current.', 1),
                  subPart('ii', 'Determine the resistance.', 2),
                ],
              }),
            ],
          }),
        ],
        paper(4, 1)
      )

      expect(assignment.evidence).toEqual([
        {
          code: 'AO1',
          signal: 'command-word',
          location: '(b)(i)',
          commandWord: 'State',
          marks: 1,
        },
        {
          code: 'AO2',
          signal: 'command-word',
          location: '(b)(ii)',
          commandWord: 'Determine',
          marks: 2,
        },
      ])
    })

    it('matches a command word after a full stop mid-text', () => {
      const [assignment] = assign(
        [question(1, 'A car accelerates. Calculate its speed.', { marks: 2 })],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual(['AO2'])
    })

    it('ignores a command word buried in prose', () => {
      // "compared" and "calculate" appear here as description, not as an
      // instruction. Scanning anywhere in the text would attribute an
      // objective to a question that never asked for one.
      const [assignment] = assign(
        [
          question(
            1,
            'The student compared the readings and used a calculator.',
            { marks: 2 }
          ),
        ],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual([])
      expect(assignment.primaryObjective).toBeUndefined()
    })

    it('ignores Sketch, which the table deliberately does not map', () => {
      const [assignment] = assign(
        [question(1, 'Sketch the magnetic field pattern.', { marks: 2 })],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual([])
    })
  })

  describe('multiple-choice questions', () => {
    // Real Q1 from June 2024 paper 11: a scale reading, answered by
    // producing a number. MCQ stems ask "What is the length ...?" rather
    // than issuing a command word, so without this signal every question
    // on papers 1 and 2 would be unclassified.
    it('reads all-quantity options as AO2', () => {
      const [assignment] = assign(
        [
          question(1, 'What is the length of the feather?', {
            marks: 1,
            options: options(['19 mm', '29 mm', '19 cm', '29 cm']),
          }),
        ],
        paper(1, 1)
      )

      expect(assignment.objectives).toEqual(['AO2'])
      expect(assignment.evidence).toEqual([
        { code: 'AO2', signal: 'quantitative-options', marks: 1 },
      ])
    })

    it('leaves a descriptive option list unclassified', () => {
      // Real Q5 from the same paper. It is recall of apparatus, but
      // nothing in the text positively says so — so no objective is
      // claimed rather than defaulting it to AO1.
      const [assignment] = assign(
        [
          question(1, 'Which piece of equipment is not needed?', {
            marks: 1,
            options: options(['pencil', 'pin', 'weight on a string', 'clamp']),
          }),
        ],
        paper(1, 1)
      )

      expect(assignment.objectives).toEqual([])
    })

    it('prefers a command word over the option list when both are present', () => {
      // The instruction is the stronger signal: it says what the
      // candidate was asked to do, not merely what the answers look like.
      const [assignment] = assign(
        [
          question(1, 'State the resistance of the wire.', {
            marks: 1,
            options: options(['1.0 N', '2.5 N', '3.6 N', '8.3 N']),
          }),
        ],
        paper(1, 1)
      )

      expect(assignment.objectives).toEqual(['AO1'])
      expect(assignment.evidence[0].signal).toBe('command-word')
    })

    it('does not let the option list override the paper rule', () => {
      const [assignment] = assign(
        [
          question(1, 'What is the average value?', {
            marks: 2,
            options: options(['1.0 N', '2.5 N', '3.6 N', '8.3 N']),
          }),
        ],
        paper(6, 1)
      )

      expect(assignment.objectives).toEqual(['AO3'])
    })
  })

  describe('primaryObjective', () => {
    it('is undefined when two objectives carry equal marks', () => {
      const [assignment] = assign(
        [
          question(1, 'A stem.', {
            parts: [
              part('a', 'State the unit.', { marks: 2 }),
              part('b', 'Calculate the value.', { marks: 2 }),
            ],
          }),
        ],
        paper(4, 1)
      )

      expect(assignment.objectives).toEqual(['AO1', 'AO2'])
      expect(assignment.primaryObjective).toBeUndefined()
    })

    it('falls back to counting signals when no marks are stated', () => {
      const [assignment] = assign(
        [
          question(1, 'A stem.', {
            parts: [
              part('a', 'State the unit.'),
              part('b', 'Give the symbol.'),
              part('c', 'Calculate the value.'),
            ],
          }),
        ],
        paper(4, 1)
      )

      expect(assignment.marksByObjective).toEqual({})
      expect(assignment.primaryObjective).toBe('AO1')
    })

    it('is undefined when nothing matched', () => {
      const [assignment] = assign(
        [question(1, 'A statement with no instruction.')],
        paper(4, 1)
      )

      expect(assignment.primaryObjective).toBeUndefined()
      expect(assignment.marksByObjective).toEqual({})
    })
  })

  describe('missing inputs', () => {
    it('still uses command words when the paper is unknown', () => {
      // An unknown paper only costs the AO3 rule; it must not discard the
      // command-word signal as well.
      const [assignment] = assign([
        question(1, 'Calculate the resultant force.', { marks: 3 }),
      ])

      expect(assignment.objectives).toEqual(['AO2'])
    })

    it('returns no objectives when the syllabus has no command words', () => {
      const result = assignAssessmentObjectives(
        questionDocument(
          [question(1, 'Calculate the resultant force.', { marks: 3 })],
          paper(4, 1)
        ),
        syllabusOverview([])
      )

      expect(result.assignments[0].objectives).toEqual([])
    })

    it('covers every question, including unclassified ones', () => {
      const assignments = assign(
        [
          question(1, 'Define acceleration.', { marks: 1 }),
          question(2, 'A statement with no instruction.'),
        ],
        paper(4, 1)
      )

      expect(assignments.map((a) => a.questionNumber)).toEqual([1, 2])
    })
  })
})
