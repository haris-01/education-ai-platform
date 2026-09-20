import type { DifficultyBand } from '@education-ai/difficulty-estimation'

import type {
  GeneratedMarkPoint,
  GeneratedOption,
  GeneratedQuestion,
  GeneratedSubPart,
} from '../types/generated-paper'
import type { TopicBrief } from '../types/generator'

const BANDS: DifficultyBand[] = ['low', 'moderate', 'high']

// Turns a model's JSON into typed questions, or fails saying why.
//
// A response schema guarantees shape, not sense — and this is the
// boundary where untrusted output becomes typed data the rest of the
// system believes. Everything is checked: a missing field is an error
// here rather than `undefined` surfacing three layers down as a paper
// with no marks on question 4.
//
// Provenance is attached from the brief, not read from the response.
// Asking a model which chunks it used invites it to invent ids, and
// the pipeline already knows exactly what it supplied.
export function parseGeneratedQuestions(
  json: string,
  brief: TopicBrief
): GeneratedQuestion[] {
  const parsed = parseJson(json)
  const questions = readArray(parsed, 'questions')

  return questions.map((entry, index) => readQuestion(entry, index, brief))
}

function parseJson(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json)

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('not an object')
    }

    return parsed as Record<string, unknown>
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Generated output was not valid JSON: ${reason}`, {
      cause: error,
    })
  }
}

function readQuestion(
  entry: unknown,
  index: number,
  brief: TopicBrief
): GeneratedQuestion {
  const at = `question ${index + 1} of topic ${brief.topicNumber}`
  const record = asRecord(entry, at)
  const parts = readParts(record.parts, at)

  return {
    // Numbered within the topic; the pipeline renumbers across the
    // paper, because a generator is not told what else is on it.
    questionNumber: index + 1,
    topicNumber: brief.topicNumber,
    text: readString(record.text, `${at}: text`),
    parts,
    options: readOptions(record.options, at),
    marks: readInteger(record.marks, `${at}: marks`),
    assessmentObjective: readString(
      record.assessmentObjective,
      `${at}: assessmentObjective`
    ),
    difficulty: readBand(record.difficulty, at),
    markScheme: readMarkScheme(record.markScheme, at),
    requiresDiagram: readBoolean(
      record.requiresDiagram,
      `${at}: requiresDiagram`
    ),
    diagramBrief:
      typeof record.diagramBrief === 'string' && record.diagramBrief.trim()
        ? record.diagramBrief.trim()
        : undefined,
    sourceChunkIds: brief.exemplars.map((hit) => hit.id),
  }
}

function readParts(value: unknown, at: string): GeneratedSubPart[] {
  if (value === undefined || value === null) {
    return []
  }

  return asArray(value, `${at}: parts`).map((entry, index) => {
    const record = asRecord(entry, `${at}: part ${index + 1}`)

    return {
      label: readString(record.label, `${at}: part ${index + 1} label`),
      text: readString(record.text, `${at}: part ${index + 1} text`),
      marks: readInteger(record.marks, `${at}: part ${index + 1} marks`),
      markScheme: readMarkScheme(record.markScheme, `${at}: part ${index + 1}`),
    }
  })
}

function readOptions(value: unknown, at: string): GeneratedOption[] {
  if (value === undefined || value === null) {
    return []
  }

  return asArray(value, `${at}: options`).map((entry, index) => {
    const record = asRecord(entry, `${at}: option ${index + 1}`)

    return {
      label: readString(record.label, `${at}: option ${index + 1} label`),
      text: readString(record.text, `${at}: option ${index + 1} text`),
      correct: readBoolean(
        record.correct,
        `${at}: option ${index + 1} correct`
      ),
    }
  })
}

function readMarkScheme(value: unknown, at: string): GeneratedMarkPoint[] {
  if (value === undefined || value === null) {
    return []
  }

  return asArray(value, `${at}: markScheme`).map((entry, index) => {
    const record = asRecord(entry, `${at}: mark point ${index + 1}`)

    return {
      text: readString(record.text, `${at}: mark point ${index + 1} text`),
      marks: readInteger(record.marks, `${at}: mark point ${index + 1} marks`),
    }
  })
}

function readBand(value: unknown, at: string): DifficultyBand {
  if (typeof value === 'string' && BANDS.includes(value as DifficultyBand)) {
    return value as DifficultyBand
  }

  throw new Error(
    `${at}: difficulty must be one of ${BANDS.join(', ')}, got ${JSON.stringify(value)}`
  )
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  return asArray(record[key], key)
}

function asArray(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${at}: expected an array, got ${JSON.stringify(value)}`)
  }

  return value
}

function asRecord(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${at}: expected an object, got ${JSON.stringify(value)}`)
  }

  return value as Record<string, unknown>
}

function readString(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${at}: expected a non-empty string`)
  }

  return value.trim()
}

function readInteger(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${at}: expected an integer, got ${JSON.stringify(value)}`)
  }

  return value
}

function readBoolean(value: unknown, at: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${at}: expected a boolean, got ${JSON.stringify(value)}`)
  }

  return value
}
