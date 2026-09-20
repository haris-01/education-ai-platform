import type { DifficultyBand } from '@education-ai/difficulty-estimation'

import type {
  GeneratedPaper,
  GeneratedQuestion,
  GeneratedSubPart,
} from '../types/generated-paper'
import type { PaperSpec } from '../types/paper-spec'

const DEFAULT_TOLERANCE_PERCENT = 10

export type ViolationSeverity = 'error' | 'warning'

export interface Violation {
  // Machine-readable, so a caller can branch without parsing prose.
  code: string

  severity: ViolationSeverity

  message: string

  questionNumber?: number
}

export interface ValidationReport {
  valid: boolean

  violations: Violation[]
}

// Checks a generated paper against the specification it was generated
// from, deterministically and with no model involved.
//
// The division between error and warning is the useful part. An error is
// something no real exam paper could be: marks that do not add up, a
// question numbered twice, a multiple-choice question with no correct
// answer. A warning is a target missed — an assessment-objective share
// three points off, a difficulty mix flatter than asked for. Boards miss
// their own weightings by a few points on real papers, so treating that
// as fatal would reject the genuine article.
export function validatePaper(
  paper: GeneratedPaper,
  spec: PaperSpec
): ValidationReport {
  const violations = [
    ...checkStructure(paper),
    ...checkMarks(paper, spec),
    ...checkTopicCoverage(paper, spec),
    ...checkAssessmentObjectives(paper, spec),
    ...checkDifficultyMix(paper, spec),
  ]

  return {
    valid: violations.every((violation) => violation.severity !== 'error'),
    violations,
  }
}

function checkStructure(paper: GeneratedPaper): Violation[] {
  const numbers = paper.questions.map((question) => question.questionNumber)

  const duplicates = numbers.filter(
    (number, index) => numbers.indexOf(number) !== index
  )

  const sequential = numbers.every((number, index) => number === index + 1)

  return [
    ...(paper.questions.length === 0
      ? [violation('EMPTY_PAPER', 'error', 'The paper has no questions.')]
      : []),
    ...(duplicates.length > 0
      ? [
          violation(
            'DUPLICATE_QUESTION_NUMBER',
            'error',
            `Question numbers repeated: ${[...new Set(duplicates)].join(', ')}.`
          ),
        ]
      : []),
    ...(!sequential && paper.questions.length > 0
      ? [
          violation(
            'NON_SEQUENTIAL_NUMBERING',
            'error',
            `Questions must run 1..n; got ${numbers.join(', ')}.`
          ),
        ]
      : []),
    ...paper.questions.flatMap(checkQuestion),
  ]
}

function checkQuestion(question: GeneratedQuestion): Violation[] {
  const hasParts = question.parts.length > 0
  const partMarks = question.parts.reduce(sumPartMarks, 0)
  const correctOptions = question.options.filter((option) => option.correct)

  return [
    ...(question.marks <= 0
      ? [
          violation(
            'NON_POSITIVE_MARKS',
            'error',
            'A question must be worth at least one mark.',
            question.questionNumber
          ),
        ]
      : []),
    ...(hasParts && partMarks !== question.marks
      ? [
          violation(
            'PART_MARKS_MISMATCH',
            'error',
            `Sub-part marks total ${partMarks} but the question is worth ${question.marks}.`,
            question.questionNumber
          ),
        ]
      : []),
    ...(!hasParts &&
    question.options.length === 0 &&
    question.markScheme.length === 0
      ? [
          violation(
            'NO_MARK_SCHEME',
            'error',
            'A question with no sub-parts must carry its own mark scheme.',
            question.questionNumber
          ),
        ]
      : []),
    ...(question.options.length > 0 && correctOptions.length !== 1
      ? [
          violation(
            'MULTIPLE_CHOICE_ANSWER',
            'error',
            `A multiple-choice question needs exactly one correct option; got ${correctOptions.length}.`,
            question.questionNumber
          ),
        ]
      : []),
    ...(question.requiresDiagram && !question.diagramBrief?.trim()
      ? [
          violation(
            'MISSING_DIAGRAM_BRIEF',
            'error',
            'A question that needs a figure must describe the figure, or it cannot be answered.',
            question.questionNumber
          ),
        ]
      : []),
    ...(question.text.trim().length === 0
      ? [
          violation(
            'EMPTY_QUESTION_TEXT',
            'error',
            'The question has no text.',
            question.questionNumber
          ),
        ]
      : []),
    ...(question.sourceChunkIds.length === 0
      ? [
          violation(
            'NO_PROVENANCE',
            'warning',
            'The question records no source material, so it cannot be traced or originality-checked against its own sources.',
            question.questionNumber
          ),
        ]
      : []),
  ]
}

function sumPartMarks(total: number, part: GeneratedSubPart): number {
  const nested = (part.subParts ?? []).reduce(sumPartMarks, 0)

  // A part with sub-parts carries its marks in them, not twice over.
  return total + (nested > 0 ? nested : part.marks)
}

function checkMarks(paper: GeneratedPaper, spec: PaperSpec): Violation[] {
  const total = paper.questions.reduce(
    (sum, question) => sum + question.marks,
    0
  )

  if (total === spec.totalMarks) {
    return []
  }

  return [
    violation(
      'TOTAL_MARKS_MISMATCH',
      'error',
      `The paper is worth ${total} marks; the specification asks for ${spec.totalMarks}.`
    ),
  ]
}

function checkTopicCoverage(
  paper: GeneratedPaper,
  spec: PaperSpec
): Violation[] {
  return spec.topics.flatMap((topic) => {
    const actual = paper.questions.filter(
      (question) => question.topicNumber === topic.topicNumber
    ).length

    if (actual === topic.questionCount) {
      return []
    }

    return [
      violation(
        'TOPIC_COVERAGE',
        'error',
        `Topic ${topic.topicNumber}: ${actual} questions, specification asks for ${topic.questionCount}.`
      ),
    ]
  })
}

function checkAssessmentObjectives(
  paper: GeneratedPaper,
  spec: PaperSpec
): Violation[] {
  if (!spec.assessmentObjectiveWeights) {
    return []
  }

  const tolerance = spec.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT
  const totalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0)

  if (totalMarks === 0) {
    return []
  }

  return Object.entries(spec.assessmentObjectiveWeights).flatMap(
    ([code, target]) => {
      const marks = paper.questions
        .filter((question) => question.assessmentObjective === code)
        .reduce((sum, question) => sum + question.marks, 0)
      const actual = (marks / totalMarks) * 100

      if (Math.abs(actual - target) <= tolerance) {
        return []
      }

      return [
        violation(
          'ASSESSMENT_OBJECTIVE_WEIGHTING',
          'warning',
          `${code}: ${actual.toFixed(0)}% of marks, specification asks for ${target}% (tolerance ${tolerance}).`
        ),
      ]
    }
  )
}

function checkDifficultyMix(
  paper: GeneratedPaper,
  spec: PaperSpec
): Violation[] {
  if (!spec.difficultyMix) {
    return []
  }

  const tolerance = spec.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT
  const count = paper.questions.length

  if (count === 0) {
    return []
  }

  const bands = Object.entries(spec.difficultyMix) as [DifficultyBand, number][]

  return bands.flatMap(([band, target]) => {
    const actual =
      (paper.questions.filter((question) => question.difficulty === band)
        .length /
        count) *
      100

    if (Math.abs(actual - target) <= tolerance) {
      return []
    }

    return [
      violation(
        'DIFFICULTY_MIX',
        'warning',
        `${band}: ${actual.toFixed(0)}% of questions, specification asks for ${target}% (tolerance ${tolerance}).`
      ),
    ]
  })
}

function violation(
  code: string,
  severity: ViolationSeverity,
  message: string,
  questionNumber?: number
): Violation {
  return { code, severity, message, questionNumber }
}
