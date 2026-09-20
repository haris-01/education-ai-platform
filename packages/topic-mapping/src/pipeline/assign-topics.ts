import type {
  Question,
  QuestionDocument,
} from '@education-ai/question-extraction'
import type { SyllabusOverview } from '@education-ai/syllabus-extraction'

import type {
  QuestionTopicAssignment,
  QuestionTopicMap,
} from '../types/question-topic-map'
import { PHYSICS_0625_TOPIC_KEYWORDS } from './topic-keywords'

const EXTRACTOR_VERSION = '0.1.0'

/**
 * Assigns each question to a syllabus topic via keyword matching against
 * `PHYSICS_0625_TOPIC_KEYWORDS`. Deterministic and auditable, not a model —
 * the appropriate first pass per docs/ROADMAP.md's "prefer deterministic
 * code before introducing AI." A question is left unclassified (no
 * `topicNumber`/`topicName`) when no keyword matches, or when two or more
 * topics tie for the top score — a wrong guess is worse than an honest gap
 * for a field downstream consumers will treat as ground truth.
 */
export function assignTopics(
  questionDocument: QuestionDocument,
  syllabus: SyllabusOverview
): QuestionTopicMap {
  const assignments = questionDocument.questions.map((question) =>
    assignTopic(question, syllabus)
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

interface ScoredTopic {
  topicNumber: number
  topicName: string
  score: number
  matchedKeywords: string[]
}

function assignTopic(
  question: Question,
  syllabus: SyllabusOverview
): QuestionTopicAssignment {
  const unclassified: QuestionTopicAssignment = {
    questionNumber: question.number,
    matchedKeywords: [],
  }

  if (syllabus.topics.length === 0) {
    return unclassified
  }

  const text = questionText(question).toLowerCase()
  const scored: ScoredTopic[] = syllabus.topics.map((topic) => {
    const keywords = PHYSICS_0625_TOPIC_KEYWORDS[topic.name] ?? []
    const matchedKeywords = keywords.filter((keyword) =>
      matchesKeyword(text, keyword)
    )
    return {
      topicNumber: topic.number,
      topicName: topic.name,
      score: matchedKeywords.length,
      matchedKeywords,
    }
  })

  const topScore = Math.max(...scored.map((s) => s.score))
  if (topScore === 0) {
    return unclassified
  }

  const leaders = scored.filter((s) => s.score === topScore)
  if (leaders.length > 1) {
    return unclassified
  }

  const [winner] = leaders
  return {
    questionNumber: question.number,
    topicNumber: winner.topicNumber,
    topicName: winner.topicName,
    matchedKeywords: winner.matchedKeywords,
  }
}

function questionText(question: Question): string {
  return [
    question.text,
    ...question.parts.flatMap((part) => [
      part.text,
      ...part.subParts.map((subPart) => subPart.text),
    ]),
    ...question.options.map((option) => option.text),
  ].join(' ')
}

// Single-word keywords also match their simple plural ("wave" ->
// "waves") — exam text is full of plurals ("forces", "particles") and a
// strict singular-only match would silently under-count. Multi-word
// phrases are left exact; pluralizing "moment" -> "moments?" is safe but
// pluralizing the tail of a phrase is not worth the added complexity.
function matchesKeyword(text: string, keyword: string): boolean {
  const lower = keyword.toLowerCase()
  const suffix = lower.includes(' ') ? '' : 's?'
  const pattern = new RegExp(`\\b${escapeRegExp(lower)}${suffix}\\b`)
  return pattern.test(text)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
