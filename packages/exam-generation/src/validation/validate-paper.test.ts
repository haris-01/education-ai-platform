import { describe, expect, it } from 'vitest'

import { option, paper, question, spec, subPart } from '../test-fixtures'
import { validatePaper } from './validate-paper'

function codes(report: ReturnType<typeof validatePaper>): string[] {
  return report.violations.map((violation) => violation.code)
}

describe('validatePaper', () => {
  it('accepts a paper that matches its specification', () => {
    const report = validatePaper(paper([question(1), question(2)]), spec())

    expect(report.valid).toBe(true)
    expect(report.violations).toEqual([])
  })

  it('rejects a paper whose marks do not add up', () => {
    const report = validatePaper(
      paper([question(1), question(2)], { totalMarks: 8 }),
      spec({ totalMarks: 50 })
    )

    expect(report.valid).toBe(false)
    expect(codes(report)).toContain('TOTAL_MARKS_MISMATCH')
  })

  it('rejects repeated and non-sequential question numbers', () => {
    const repeated = validatePaper(
      paper([question(1), question(1)]),
      spec({ totalMarks: 8 })
    )
    const gapped = validatePaper(
      paper([question(1), question(3)]),
      spec({ totalMarks: 8 })
    )

    expect(codes(repeated)).toContain('DUPLICATE_QUESTION_NUMBER')
    expect(codes(gapped)).toContain('NON_SEQUENTIAL_NUMBERING')
  })

  it('rejects a multiple-choice question without exactly one answer', () => {
    // The failure that makes a paper unusable rather than imperfect.
    const none = validatePaper(
      paper([
        question(1, {
          options: [option('A', 'one'), option('B', 'two')],
          marks: 8,
        }),
      ]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )
    const two = validatePaper(
      paper([
        question(1, {
          options: [option('A', 'one', true), option('B', 'two', true)],
          marks: 8,
        }),
      ]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(codes(none)).toContain('MULTIPLE_CHOICE_ANSWER')
    expect(codes(two)).toContain('MULTIPLE_CHOICE_ANSWER')
  })

  it('rejects sub-part marks that do not sum to the question', () => {
    const report = validatePaper(
      paper([
        question(1, {
          marks: 8,
          parts: [subPart('a', 'First part.', 3), subPart('b', 'Second.', 2)],
        }),
      ]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(codes(report)).toContain('PART_MARKS_MISMATCH')
  })

  it('counts marks once for a part that has sub-parts of its own', () => {
    const report = validatePaper(
      paper([
        question(1, {
          marks: 8,
          parts: [
            subPart('a', 'First part.', 8, {
              subParts: [
                subPart('i', 'Nested one.', 5),
                subPart('ii', 'Nested two.', 3),
              ],
            }),
          ],
        }),
      ]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(codes(report)).not.toContain('PART_MARKS_MISMATCH')
  })

  it('rejects a question that needs a figure but does not describe one', () => {
    // Otherwise the paper ships a question nobody can answer.
    const report = validatePaper(
      paper([question(1, { marks: 8, requiresDiagram: true })]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(codes(report)).toContain('MISSING_DIAGRAM_BRIEF')
  })

  it('accepts a question that needs a figure and briefs it', () => {
    const report = validatePaper(
      paper([
        question(1, {
          marks: 8,
          requiresDiagram: true,
          diagramBrief: 'A trolley on a ramp inclined at 30 degrees.',
        }),
      ]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(report.valid).toBe(true)
  })

  it('rejects a question with no way to mark it', () => {
    const report = validatePaper(
      paper([question(1, { marks: 8, markScheme: [] })]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(codes(report)).toContain('NO_MARK_SCHEME')
  })

  it('rejects the wrong number of questions on a topic', () => {
    const report = validatePaper(
      paper([question(1, { topicNumber: 1 }), question(2, { topicNumber: 1 })]),
      spec({
        topics: [
          { topicNumber: 1, questionCount: 1 },
          { topicNumber: 3, questionCount: 1 },
        ],
      })
    )

    expect(codes(report)).toContain('TOPIC_COVERAGE')
    expect(report.valid).toBe(false)
  })

  it('treats a missed weighting as a warning, not a failure', () => {
    // Boards miss their own published weightings by a few points on real
    // papers. Treating that as fatal would reject the genuine article.
    const report = validatePaper(
      paper([
        question(1, { assessmentObjective: 'AO1' }),
        question(2, { assessmentObjective: 'AO1' }),
      ]),
      spec({ assessmentObjectiveWeights: { AO1: 50, AO2: 50 } })
    )

    expect(report.valid).toBe(true)
    expect(codes(report)).toContain('ASSESSMENT_OBJECTIVE_WEIGHTING')
    expect(report.violations.every((v) => v.severity === 'warning')).toBe(true)
  })

  it('accepts a weighting inside tolerance', () => {
    const report = validatePaper(
      paper([
        question(1, { assessmentObjective: 'AO1' }),
        question(2, { assessmentObjective: 'AO2' }),
      ]),
      spec({ assessmentObjectiveWeights: { AO1: 50, AO2: 50 } })
    )

    expect(codes(report)).not.toContain('ASSESSMENT_OBJECTIVE_WEIGHTING')
  })

  it('warns when a paper comes out flatter than the difficulty asked for', () => {
    const report = validatePaper(
      paper([
        question(1, { difficulty: 'low' }),
        question(2, { difficulty: 'low' }),
      ]),
      spec({ difficultyMix: { low: 33, moderate: 33, high: 34 } })
    )

    expect(codes(report)).toContain('DIFFICULTY_MIX')
    expect(report.valid).toBe(true)
  })

  it('rejects an empty paper', () => {
    const report = validatePaper(paper([]), spec({ totalMarks: 0, topics: [] }))

    expect(codes(report)).toContain('EMPTY_PAPER')
    expect(report.valid).toBe(false)
  })

  it('warns when a question records no provenance', () => {
    const report = validatePaper(
      paper([question(1, { marks: 8, sourceChunkIds: [] })]),
      spec({ topics: [{ topicNumber: 1, questionCount: 1 }] })
    )

    expect(codes(report)).toContain('NO_PROVENANCE')
    expect(report.valid).toBe(true)
  })
})
