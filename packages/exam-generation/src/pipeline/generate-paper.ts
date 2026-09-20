import type { GenerationContext } from '@education-ai/vector-store'
import type { SearchHit } from '@education-ai/vector-store'

import type {
  GeneratedPaper,
  GeneratedQuestion,
} from '../types/generated-paper'
import type { QuestionGenerator, TopicBrief } from '../types/generator'
import type { PaperSpec } from '../types/paper-spec'
import type { OriginalityReport } from '../validation/check-originality'
import { checkOriginality } from '../validation/check-originality'
import type { ValidationReport } from '../validation/validate-paper'
import { validatePaper } from '../validation/validate-paper'

export interface GeneratePaperInput {
  spec: PaperSpec

  // Retrieved by `retrieveForGeneration`, which needs no model call.
  context: GenerationContext

  generator: QuestionGenerator

  multipleChoice?: boolean
}

export interface GeneratePaperResult {
  paper: GeneratedPaper

  validation: ValidationReport

  originality: OriginalityReport

  // Retrieval's own complaints, carried through rather than dropped. A
  // paper built on one exemplar per topic may validate perfectly and
  // still be a bad paper, and the reason is here rather than in the
  // validation report.
  retrievalShortfalls: string[]
}

// Generates a paper, then checks it.
//
// Returns the paper whether or not it passed. A caller deciding what to
// do with a paper that missed its weighting by four points needs to see
// it, and throwing would make the common case — generate, inspect,
// regenerate the weak topics — impossible to write.
export async function generatePaper(
  input: GeneratePaperInput
): Promise<GeneratePaperResult> {
  const { spec, context, generator } = input

  const briefs = buildBriefs(spec, context, input.multipleChoice ?? false)
  const generated = await Promise.all(
    briefs.map((brief) => generator.generateTopic(brief))
  )

  const questions = renumber(generated.flat())

  const paper: GeneratedPaper = {
    syllabusCode: spec.syllabusCode,
    title: spec.title,
    totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
    questions,
    generatorModel: generator.model,
    generatedAt: new Date(),
  }

  return {
    paper,
    validation: validatePaper(paper, spec),
    originality: checkOriginality(questions, allSources(context)),
    retrievalShortfalls: context.shortfalls,
  }
}

function buildBriefs(
  spec: PaperSpec,
  context: GenerationContext,
  multipleChoice: boolean
): TopicBrief[] {
  const marksByTopic = distributeMarks(spec)

  return spec.topics.map((topic) => {
    const retrieved = context.topics.find(
      (entry) => entry.topicNumber === topic.topicNumber
    )

    return {
      syllabusCode: spec.syllabusCode,
      topicNumber: topic.topicNumber,
      topicName: retrieved?.topicName,
      questionCount: topic.questionCount,
      marks: marksByTopic.get(topic.topicNumber) ?? 0,
      objectives: retrieved?.objectives ?? [],
      exemplars: retrieved?.exemplars ?? [],
      insights: retrieved?.insights ?? [],
      assessmentObjectiveWeights: spec.assessmentObjectiveWeights,
      difficultyMix: spec.difficultyMix,
      multipleChoice,
    }
  })
}

// Marks are split across topics in proportion to how many questions
// each carries, with the remainder going to the topics with most
// questions. Splitting evenly per topic would make a one-question topic
// worth as much as a five-question one; letting each topic round
// independently would miss the paper's total, which validatePaper
// treats as an error — correctly, since a paper whose marks do not add
// up is not a paper.
function distributeMarks(spec: PaperSpec): Map<number, number> {
  const totalQuestions = spec.topics.reduce(
    (sum, topic) => sum + topic.questionCount,
    0
  )

  if (totalQuestions === 0) {
    return new Map()
  }

  const exact = spec.topics.map((topic) => ({
    topicNumber: topic.topicNumber,
    questionCount: topic.questionCount,
    share: (topic.questionCount / totalQuestions) * spec.totalMarks,
  }))

  const floored = exact.map((entry) => ({
    ...entry,
    marks: Math.floor(entry.share),
  }))

  const shortfall =
    spec.totalMarks - floored.reduce((sum, entry) => sum + entry.marks, 0)

  // Largest-remainder, tie-broken by question count so the extra mark
  // lands where there is a question to put it on.
  const order = [...floored].sort((a, b) => {
    const remainder = (b.share % 1) - (a.share % 1)
    return remainder !== 0 ? remainder : b.questionCount - a.questionCount
  })

  return new Map(
    floored.map((entry) => {
      const rank = order.findIndex(
        (candidate) => candidate.topicNumber === entry.topicNumber
      )
      return [entry.topicNumber, entry.marks + (rank < shortfall ? 1 : 0)]
    })
  )
}

// Generators number questions from 1 within their own topic, because
// they are not told what else is on the paper.
function renumber(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    questionNumber: index + 1,
  }))
}

function allSources(context: GenerationContext): SearchHit[] {
  return context.topics.flatMap((topic) => [
    ...topic.exemplars,
    ...topic.objectives,
    ...topic.insights,
  ])
}
