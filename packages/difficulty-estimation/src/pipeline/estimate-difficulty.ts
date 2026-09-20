import type { PaperExaminerReport } from '@education-ai/examiner-report-extraction'
import type { QuestionDocument } from '@education-ai/question-extraction'
import { splitSentences } from '@education-ai/shared'

import type {
  CandidateOutcome,
  DifficultyBand,
  DifficultyEvidence,
  QuestionDifficulty,
  QuestionDifficultyMap,
} from '../types/question-difficulty'
import type { CandidateShare } from './performance-language'
import {
  findDirectDifficulty,
  findOutcome,
  findQuantifier,
} from './performance-language'

const EXTRACTOR_VERSION = '0.1.0'

// How a share of candidates plus an outcome reads as difficulty. The
// table is symmetric: a large share succeeding means an easy question, a
// large share failing means a hard one, and both flip when the share is
// small. "Few candidates made this error" therefore counts as evidence of
// an easy question, which is what it means.
const BAND_BY_SHARE_AND_OUTCOME: Record<
  CandidateShare,
  Record<CandidateOutcome, DifficultyBand>
> = {
  most: { success: 'low', failure: 'high' },
  many: { success: 'moderate', failure: 'high' },
  few: { success: 'high', failure: 'low' },
}

// Averaging needs an ordering, and rounding the mean back gives the band.
const BAND_SCORES: Record<DifficultyBand, number> = {
  low: 0,
  moderate: 1,
  high: 2,
}
const BANDS_BY_SCORE: DifficultyBand[] = ['low', 'moderate', 'high']

/**
 * Estimates how hard each question proved, from the way the principal
 * examiner describes candidate performance.
 *
 * This is the only difficulty signal in the pipeline grounded in what
 * candidates actually did. Marks are not used: a four-mark question is
 * longer than a one-mark question, not necessarily harder, and treating
 * the two as the same thing would bury the real signal under an
 * irrelevant one.
 *
 * Deterministic phrase matching per docs/ROADMAP.md's "prefer
 * deterministic code before introducing AI", and every band carries the
 * sentences that produced it so a call can be checked against the report.
 *
 * A question the report says nothing measurable about is left with no
 * band, rather than defaulted to "moderate" — a default would be
 * indistinguishable from a genuinely middling result.
 */
export function estimateDifficulty(
  questionDocument: QuestionDocument,
  examinerReport?: PaperExaminerReport
): QuestionDifficultyMap {
  const commentByQuestion = new Map(
    (examinerReport?.questionComments ?? []).map((comment) => [
      comment.questionNumber,
      comment.comment,
    ])
  )

  const assignments = questionDocument.questions.map(
    (question): QuestionDifficulty => {
      const evidence = collectEvidence(
        commentByQuestion.get(question.number) ?? ''
      )

      return {
        questionNumber: question.number,
        band: averageBand(evidence),
        evidence,
      }
    }
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

function collectEvidence(comment: string): DifficultyEvidence[] {
  return splitSentences(comment).flatMap((sentence): DifficultyEvidence[] => {
    const stated = statedEvidence(sentence)
    if (stated) {
      return [stated]
    }

    const inferred = inferredEvidence(sentence)
    return inferred ? [inferred] : []
  })
}

// An examiner's own verdict on the question, which needs no
// interpretation and so is preferred over the quantifier rules.
function statedEvidence(sentence: string): DifficultyEvidence | undefined {
  const band = findDirectDifficulty(sentence)
  if (!band) {
    return undefined
  }

  return {
    band,
    phrase: 'stated difficulty',
    outcome: band === 'high' ? 'failure' : 'success',
    sentence,
  }
}

// How many candidates did what, turned into a band by the table above.
function inferredEvidence(sentence: string): DifficultyEvidence | undefined {
  const quantifier = findQuantifier(sentence)
  if (!quantifier) {
    return undefined
  }

  const outcome = findOutcome(sentence)
  if (!outcome) {
    return undefined
  }

  return {
    band: BAND_BY_SHARE_AND_OUTCOME[quantifier.share][outcome],
    phrase: quantifier.phrase,
    outcome,
    sentence,
  }
}

// A whole question routinely mixes easy and hard sub-parts, so the bands
// are averaged rather than voted on: a question whose evidence is half
// "low" and half "high" lands on "moderate", which is a fairer summary
// than picking whichever side happened to have one more sentence.
function averageBand(
  evidence: DifficultyEvidence[]
): DifficultyBand | undefined {
  if (evidence.length === 0) {
    return undefined
  }

  const total = evidence.reduce((sum, item) => sum + BAND_SCORES[item.band], 0)

  return BANDS_BY_SCORE[Math.round(total / evidence.length)]
}
