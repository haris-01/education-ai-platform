import type { ParsedDocument } from '@education-ai/document-ai'
import { reconstructLines } from '@education-ai/question-extraction'
import type { Line } from '@education-ai/question-extraction'

import type {
  ExaminerReport,
  PaperExaminerReport,
  QuestionComment,
} from '../types/examiner-report'

const EXTRACTOR_VERSION = '0.1.0'

// The page header ("Cambridge International General Certificate of
// Secondary Education", the session/subject line, "Principal Examiner
// Report for Teachers") repeats at the top of every page, and a
// copyright line repeats at the bottom. Both would otherwise get glued
// into whatever comment block was open across a page break — filtered
// by position, the same class of fix as question-extraction's
// boilerplate handling.
const PAGE_HEADER_MAX_Y = 40
const PAGE_FOOTER_MIN_Y = 800

// A single examiner report PDF covers every paper variant in a session
// (e.g. 0625/11, 0625/12, 0625/13, 0625/21, ...), each introduced by a
// "Paper 0625/NN" marker line — confirmed against a real report covering
// 18 paper variants across one document.
const PAPER_MARKER_PATTERN = /^Paper (\d{4}\/\d{2})$/
const QUESTION_HEADING_PATTERN = /^Question (\d{1,2})$/
const GENERAL_COMMENTS_HEADING = 'General comments'
const SPECIFIC_QUESTIONS_HEADING = 'Comments on specific questions'

/**
 * Extracts per-question examiner commentary (common mistakes, advice) from
 * a Cambridge principal examiner report. Each question's commentary is
 * captured as one joined text block — any internal sub-part structure
 * ("(a)", "(b) (i)") is left as plain text, not parsed into a tree.
 */
export function buildExaminerReport(parsed: ParsedDocument): ExaminerReport {
  const lines = parsed.pages
    .flatMap((page) => reconstructLines(page))
    .filter((line) => !isPageBoilerplate(line))

  return {
    metadata: {
      resourceId: parsed.metadata.resourceId,
      title: parsed.metadata.title,
      pageCount: parsed.metadata.pageCount,
      extractedAt: new Date(),
      extractorVersion: EXTRACTOR_VERSION,
    },
    papers: extractPapers(lines),
  }
}

function isPageBoilerplate(line: Line): boolean {
  return (
    line.boundingBox.y < PAGE_HEADER_MAX_Y ||
    line.boundingBox.y > PAGE_FOOTER_MIN_Y
  )
}

function extractPapers(lines: Line[]): PaperExaminerReport[] {
  const markers = lines.flatMap((line, index) => {
    const match = line.text.trim().match(PAPER_MARKER_PATTERN)
    return match ? [{ index, paperCode: match[1] }] : []
  })

  return markers.map((marker, markerPosition) => {
    const chunkEnd = markers[markerPosition + 1]?.index ?? lines.length
    const chunk = lines.slice(marker.index + 1, chunkEnd)
    return buildPaperReport(marker.paperCode, chunk)
  })
}

function buildPaperReport(paperCode: string, lines: Line[]): PaperExaminerReport {
  const generalComments = sectionBetween(lines, GENERAL_COMMENTS_HEADING, [
    SPECIFIC_QUESTIONS_HEADING,
  ])
    .map((line) => line.text.trim())
    .join(' ')

  const questionCommentsSection = sectionAfter(lines, SPECIFIC_QUESTIONS_HEADING)

  return {
    paperCode,
    generalComments,
    questionComments: buildQuestionComments(questionCommentsSection),
  }
}

interface QuestionCommentDraft {
  questionNumber: number
  textParts: string[]
}

function buildQuestionComments(lines: Line[]): QuestionComment[] {
  const drafts = lines.reduce<QuestionCommentDraft[]>((acc, line) => {
    const text = line.text.trim()
    const headingMatch = text.match(QUESTION_HEADING_PATTERN)
    if (headingMatch) {
      return [...acc, { questionNumber: Number(headingMatch[1]), textParts: [] }]
    }

    const current = acc[acc.length - 1]
    if (!current) {
      return acc
    }
    const updated: QuestionCommentDraft = {
      ...current,
      textParts: [...current.textParts, text],
    }
    return [...acc.slice(0, -1), updated]
  }, [])

  return drafts.map((draft) => ({
    questionNumber: draft.questionNumber,
    comment: draft.textParts.join(' ').trim(),
  }))
}

function sectionBetween(
  lines: Line[],
  startHeading: string,
  endHeadings: string[]
): Line[] {
  const startIndex = lines.findIndex((line) => line.text.trim() === startHeading)
  if (startIndex === -1) {
    return []
  }
  const after = lines.slice(startIndex + 1)
  const endIndex = after.findIndex((line) => endHeadings.includes(line.text.trim()))
  return endIndex === -1 ? after : after.slice(0, endIndex)
}

function sectionAfter(lines: Line[], startHeading: string): Line[] {
  const startIndex = lines.findIndex((line) => line.text.trim() === startHeading)
  return startIndex === -1 ? [] : lines.slice(startIndex + 1)
}
