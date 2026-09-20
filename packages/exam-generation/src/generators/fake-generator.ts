import type { DifficultyBand } from '@education-ai/difficulty-estimation'

import type { GeneratedQuestion } from '../types/generated-paper'
import type { QuestionGenerator, TopicBrief } from '../types/generator'

const BANDS: DifficultyBand[] = ['low', 'moderate', 'high']

// A deterministic stand-in for a real question generator.
//
// Same reasoning as the fake embedder: it is not a weak model, it has
// no understanding at all. What it does have is the property the tests
// need — it always produces a paper that satisfies its brief exactly,
// so anything the pipeline reports is the pipeline's doing and not the
// model's mood. That makes it possible to test spec conformance,
// renumbering, mark arithmetic, assembly and failure handling with no
// key, no network and no cost.
//
// It is useless for judging question quality, and will produce nonsense
// with total confidence if asked to.
export function createFakeGenerator(): QuestionGenerator {
  return {
    model: 'fake-generator',
    generateTopic: async (brief) =>
      distributeMarks(brief).map((marks, index) =>
        buildQuestion(brief, index, marks)
      ),
  }
}

// Whole marks that sum to exactly the brief's total, with the remainder
// spread over the earliest questions rather than dumped on the last —
// a 7-mark topic over 2 questions is 4 and 3, not 3 and 4, and never
// 3 and 3.
function distributeMarks(brief: TopicBrief): number[] {
  const count = Math.max(brief.questionCount, 0)

  if (count === 0) {
    return []
  }

  const base = Math.floor(brief.marks / count)
  const remainder = brief.marks % count

  return Array.from({ length: count }, (_unused, index) =>
    index < remainder ? base + 1 : base
  )
}

function buildQuestion(
  brief: TopicBrief,
  index: number,
  marks: number
): GeneratedQuestion {
  const objectives = Object.keys(
    brief.assessmentObjectiveWeights ?? {
      AO1: 100,
    }
  )

  return {
    questionNumber: index + 1,
    topicNumber: brief.topicNumber,
    text: `Generated question ${index + 1} on topic ${brief.topicNumber}.`,
    parts: [],
    options: brief.multipleChoice ? buildOptions(index) : [],
    marks,
    assessmentObjective: objectives[index % objectives.length],
    difficulty: BANDS[index % BANDS.length],
    markScheme: [{ text: `Expected answer for question ${index + 1}.`, marks }],
    // Every third question asks for a figure. A fake that never
    // exercises a branch is not standing in for the real generator on
    // that branch — and the diagram path reaches all the way to the
    // PDF, so leaving it dark would mean the end-to-end run proved
    // less than it appeared to.
    requiresDiagram: index % 3 === 2,
    diagramBrief:
      index % 3 === 2
        ? `A labelled figure for question ${index + 1} on topic ${brief.topicNumber}.`
        : undefined,
    sourceChunkIds: brief.exemplars.map((hit) => hit.id),
  }
}

function buildOptions(index: number) {
  return ['A', 'B', 'C', 'D'].map((label, optionIndex) => ({
    label,
    text: `Option ${label} for question ${index + 1}.`,
    correct: optionIndex === index % 4,
  }))
}
