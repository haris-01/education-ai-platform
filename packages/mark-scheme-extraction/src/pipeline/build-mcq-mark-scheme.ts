import type { ParsedDocument } from '@education-ai/document-ai'
import { reconstructLines } from '@education-ai/question-extraction'

import type { McqAnswer, McqMarkScheme } from '../types/mcq-mark-scheme'

const EXTRACTOR_VERSION = '0.1.0'

// "1 A 1" -> question 1, answer A, 1 mark. Cambridge MCQ mark schemes are
// a simple single-column table ("Question Answer Marks" header, then one
// row per question) — confirmed against real 0625 paper 1/2 mark
// schemes. Reuses question-extraction's `reconstructLines` since flat
// text runs -> reading-order lines is the same problem regardless of
// document type; only the line pattern differs.
const ANSWER_ROW_PATTERN = /^(\d{1,2})\s+([A-D])\s+(\d+)$/
// A question can be voided after the exam if the board finds it flawed —
// "14 Question Discounted 1" instead of a lettered answer. Confirmed
// against a real 0625 past paper. Captured explicitly (answer:
// "Discounted") rather than silently skipped, so a downstream consumer
// sees a real reason for the gap instead of an unexplained missing
// question number.
const DISCOUNTED_ROW_PATTERN = /^(\d{1,2})\s+Question\s+Discounted\s+(\d+)$/i

/**
 * Extracts the answer key from a Cambridge multiple-choice mark scheme.
 * Theory-paper mark schemes use a different, much denser table layout
 * (marking points and guidance per sub-part, not a flat answer list) and
 * are not handled here — see docs/learning-notes for why.
 */
export function buildMcqMarkScheme(parsed: ParsedDocument): McqMarkScheme {
  const lines = parsed.pages.flatMap((page) => reconstructLines(page))

  const answers = lines.flatMap((line): McqAnswer[] => {
    const text = line.text.trim()

    const match = text.match(ANSWER_ROW_PATTERN)
    if (match) {
      return [
        {
          questionNumber: Number(match[1]),
          answer: match[2],
          marks: Number(match[3]),
        },
      ]
    }

    const discountedMatch = text.match(DISCOUNTED_ROW_PATTERN)
    if (discountedMatch) {
      return [
        {
          questionNumber: Number(discountedMatch[1]),
          answer: 'Discounted',
          marks: Number(discountedMatch[2]),
        },
      ]
    }

    return []
  })

  return {
    metadata: {
      resourceId: parsed.metadata.resourceId,
      title: parsed.metadata.title,
      pageCount: parsed.metadata.pageCount,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    answers,
  }
}
