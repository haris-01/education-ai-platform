import type {
  Question,
  QuestionDocument,
} from '@education-ai/question-extraction'
import type { SyllabusOverview } from '@education-ai/syllabus-extraction'

import type {
  AssessmentObjectiveEvidence,
  QuestionAssessmentObjectiveMap,
  QuestionAssessmentObjectives,
} from '../types/question-assessment-objectives'
import { COMMAND_WORD_OBJECTIVES } from './command-word-objectives'
import { hasQuantitativeOptions } from './quantitative-options'

const EXTRACTOR_VERSION = '0.1.0'

// The syllabus states the AO weighting of every component: papers 1-4 are
// AO1/AO2 and 0% AO3, papers 5 and 6 are 100% AO3. That makes the paper a
// harder fact than anything the question text can offer, so papers 5 and
// 6 are settled by this rule alone and never consult a command word.
const PRACTICAL_PAPER_NUMBERS = [5, 6]
const PRACTICAL_OBJECTIVE = 'AO3'

// AO2 covers "solve problems, including some of a quantitative nature",
// which is exactly what a multiple-choice question with four numeric
// options asks for.
const QUANTITATIVE_OBJECTIVE = 'AO2'

/**
 * Works out which assessment objectives each question assesses, from the
 * paper it belongs to and the command words it uses. Deterministic and
 * auditable rather than a model — the appropriate first pass per
 * docs/ROADMAP.md's "prefer deterministic code before introducing AI" —
 * and every call carries the evidence that produced it.
 *
 * Two signals, in priority order:
 *
 * 1. The paper. The syllabus assigns AO3 to papers 5 and 6 exclusively,
 *    and excludes it from papers 1-4. This is stated, not inferred.
 * 2. The command word. Within papers 1-4 the published glossary
 *    distinguishes recall (AO1) from handling information (AO2).
 *
 * A question with no usable signal is left with no objectives rather than
 * being defaulted to the most common one, matching how topic-mapping
 * reports an unclassified question.
 */
export function assignAssessmentObjectives(
  questionDocument: QuestionDocument,
  syllabus: SyllabusOverview
): QuestionAssessmentObjectiveMap {
  const paperNumber = questionDocument.metadata.paper?.number
  const commandWords = syllabus.commandWords.map((entry) => entry.word)

  const assignments = questionDocument.questions.map((question) =>
    assignForQuestion(question, paperNumber, commandWords)
  )

  return {
    metadata: {
      resourceId: questionDocument.metadata.resourceId,
      title: questionDocument.metadata.title,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    assignments,
  }
}

function assignForQuestion(
  question: Question,
  paperNumber: number | undefined,
  commandWords: string[]
): QuestionAssessmentObjectives {
  const evidence = collectEvidence(question, paperNumber, commandWords)
  const marksByObjective = sumMarksByObjective(evidence)

  return {
    questionNumber: question.number,
    objectives: [...new Set(evidence.map((item) => item.code))].sort(),
    primaryObjective: findPrimaryObjective(evidence, marksByObjective),
    marksByObjective,
    evidence,
  }
}

function collectEvidence(
  question: Question,
  paperNumber: number | undefined,
  commandWords: string[]
): AssessmentObjectiveEvidence[] {
  if (paperNumber !== undefined && isPracticalPaper(paperNumber)) {
    return [
      { code: PRACTICAL_OBJECTIVE, signal: 'paper', marks: question.marks },
    ]
  }

  const fromCommandWords = segmentsOf(question).flatMap(
    (segment): AssessmentObjectiveEvidence[] => {
      const commandWord = findCommandWord(segment.text, commandWords)
      if (!commandWord) {
        return []
      }

      const code = COMMAND_WORD_OBJECTIVES[commandWord]
      if (!code) {
        return []
      }

      return [
        {
          code,
          signal: 'command-word',
          location: segment.location,
          commandWord,
          marks: segment.marks,
        },
      ]
    }
  )

  if (fromCommandWords.length > 0) {
    return fromCommandWords
  }

  // Only consulted when no command word was found. Multiple-choice
  // questions ask "Which row ...?" or "What is the length ...?" rather
  // than issuing a command word, so without this every question on papers
  // 1 and 2 would be unclassified.
  if (hasQuantitativeOptions(question.options)) {
    return [
      {
        code: QUANTITATIVE_OBJECTIVE,
        signal: 'quantitative-options',
        marks: question.marks,
      },
    ]
  }

  return []
}

function isPracticalPaper(paperNumber: number): boolean {
  return PRACTICAL_PAPER_NUMBERS.includes(paperNumber)
}

interface QuestionSegment {
  // Undefined for the question stem, which has no part label.
  location?: string
  text: string
  marks?: number
}

// Each part and sub-part is scored separately: a question that asks
// "Define ..." then "Calculate ..." assesses both AO1 and AO2, and
// flattening it to one blob of text would lose that. Sub-parts are
// labelled with their parent ("(b)(i)") so evidence points at the place
// the exam itself names.
function segmentsOf(question: Question): QuestionSegment[] {
  const stem: QuestionSegment = {
    text: question.text,
    marks: question.parts.length === 0 ? question.marks : undefined,
  }

  const parts = question.parts.flatMap((part): QuestionSegment[] => {
    const own: QuestionSegment = {
      location: `(${part.label})`,
      text: part.text,
      marks: part.subParts.length === 0 ? part.marks : undefined,
    }

    const subParts = part.subParts.map((subPart): QuestionSegment => ({
      location: `(${part.label})(${subPart.label})`,
      text: subPart.text,
      marks: subPart.marks,
    }))

    return [own, ...subParts]
  })

  return [stem, ...parts]
}

// Command words are matched only where a question actually issues an
// instruction: at the start of the text, or after a full stop. Scanning
// anywhere would match the prose ("the student will calculate ...",
// "compared with the first reading") and attribute an objective to a
// question that never asked for it.
function findCommandWord(
  text: string,
  commandWords: string[]
): string | undefined {
  const trimmed = text.trim()
  if (trimmed === '') {
    return undefined
  }

  return commandWords.find((word) => {
    const pattern = new RegExp(`(?:^|\\.\\s+)${word}\\b`, 'i')
    return pattern.test(trimmed)
  })
}

function sumMarksByObjective(
  evidence: AssessmentObjectiveEvidence[]
): Record<string, number> {
  return evidence.reduce<Record<string, number>>((totals, item) => {
    if (item.marks === undefined) {
      return totals
    }

    return {
      ...totals,
      [item.code]: (totals[item.code] ?? 0) + item.marks,
    }
  }, {})
}

// Marks decide, because that is the unit the syllabus states its own AO
// weightings in. When no marks are stated anywhere, the count of signals
// is the only ordering available; either way a tie yields undefined.
function findPrimaryObjective(
  evidence: AssessmentObjectiveEvidence[],
  marksByObjective: Record<string, number>
): string | undefined {
  const scores =
    Object.keys(marksByObjective).length > 0
      ? Object.entries(marksByObjective)
      : Object.entries(countByObjective(evidence))

  if (scores.length === 0) {
    return undefined
  }

  const topScore = Math.max(...scores.map(([, score]) => score))
  const leaders = scores.filter(([, score]) => score === topScore)

  return leaders.length === 1 ? leaders[0][0] : undefined
}

function countByObjective(
  evidence: AssessmentObjectiveEvidence[]
): Record<string, number> {
  return evidence.reduce<Record<string, number>>(
    (counts, item) => ({
      ...counts,
      [item.code]: (counts[item.code] ?? 0) + 1,
    }),
    {}
  )
}
