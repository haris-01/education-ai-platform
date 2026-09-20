import type { DifficultyBand } from '@education-ai/difficulty-estimation'

import type {
  SearchFilter,
  SearchHit,
  VectorStore,
} from '../types/vector-store'

// How many of a topic's objectives are used as seeds. Every objective
// would be thorough and slow — topic 3 alone has 56 — and the exemplars
// they return overlap heavily. Enough to span the topic, not enough to
// re-retrieve the same questions from every angle.
const DEFAULT_SEED_OBJECTIVES = 8

const DEFAULT_EXEMPLARS_PER_TOPIC = 5

const DEFAULT_INSIGHTS_PER_TOPIC = 5

// Everything a paper's specification says about one topic.
export interface TopicRequirement {
  topicNumber: number

  // How many exemplar questions to gather for it. More than the number
  // of questions to be generated: a generator choosing between five is
  // imitating a style, one handed a single example is copying it.
  exemplars?: number
}

export interface RetrieveForGenerationInput {
  store: VectorStore

  topics: TopicRequirement[]

  syllabusCode?: string

  // Papers not to retrieve from. Generating a replacement for 0625/41
  // while reading 0625/41 produces a paraphrase of it.
  excludeSourceDocumentIds?: string[]

  difficulties?: DifficultyBand[]

  assessmentObjectives?: string[]

  seedObjectives?: number

  insightsPerTopic?: number
}

export interface TopicContext {
  topicNumber: number

  topicName?: string

  // What the syllabus says must be taught under this topic.
  objectives: SearchHit[]

  // Real questions to imitate. Exemplars only — never a chunk whose
  // extraction is known to be incomplete.
  exemplars: SearchHit[]

  // What candidates got wrong here, in the examiner's own words. Phase 7
  // needs these to write distractors that are wrong in realistic ways.
  insights: SearchHit[]
}

export interface GenerationContext {
  topics: TopicContext[]

  // What could not be satisfied, in plain words. A generator handed
  // thin context should be told, not left to infer it from a short
  // array — and a caller should be able to refuse to generate rather
  // than produce a paper quietly based on one example.
  shortfalls: string[]
}

// Gathers everything needed to generate questions for a set of topics,
// without calling an embedding model.
//
// That is the design's main claim. Exemplars are found from the stored
// vectors of the syllabus objectives themselves, so retrieval needs no
// query text to embed: the thing being matched is the objective, not a
// paraphrase of it. Generation becomes one model call instead of two,
// and the retrieval half stays testable with no key and no network.
//
// Coverage is per topic by construction rather than by hoping a global
// top-k spreads out. A single ranked search over the whole corpus
// returns whatever the corpus has most of, which is how a generated
// paper ends up with four questions on forces and none on the Sun.
export async function retrieveForGeneration(
  input: RetrieveForGenerationInput
): Promise<GenerationContext> {
  const { store, topics } = input
  const seedCount = input.seedObjectives ?? DEFAULT_SEED_OBJECTIVES
  const insightCount = input.insightsPerTopic ?? DEFAULT_INSIGHTS_PER_TOPIC

  const contexts = await Promise.all(
    topics.map((topic) =>
      retrieveTopic(topic, input, seedCount, insightCount, store)
    )
  )

  return {
    topics: contexts,
    shortfalls: contexts.flatMap((context) =>
      describeShortfall(context, topics)
    ),
  }
}

async function retrieveTopic(
  topic: TopicRequirement,
  input: RetrieveForGenerationInput,
  seedCount: number,
  insightCount: number,
  store: VectorStore
): Promise<TopicContext> {
  const scope: SearchFilter = {
    syllabusCode: input.syllabusCode,
    topicNumbers: [topic.topicNumber],
  }

  const [objectives, insights] = await Promise.all([
    store.listChunks(
      { ...scope, chunkTypes: ['learningObjective'] },
      seedCount
    ),
    store.listChunks(
      { ...scope, chunkTypes: ['examinerInsight'] },
      insightCount
    ),
  ])

  const exemplars = await gatherExemplars(objectives, topic, input, store)

  return {
    topicNumber: topic.topicNumber,
    topicName:
      objectives[0]?.metadata.topicName ?? insights[0]?.metadata.topicName,
    objectives,
    exemplars,
    insights,
  }
}

async function gatherExemplars(
  objectives: SearchHit[],
  topic: TopicRequirement,
  input: RetrieveForGenerationInput,
  store: VectorStore
): Promise<SearchHit[]> {
  const wanted = topic.exemplars ?? DEFAULT_EXEMPLARS_PER_TOPIC

  const exemplarFilter: SearchFilter = {
    syllabusCode: input.syllabusCode,
    topicNumbers: [topic.topicNumber],
    chunkTypes: ['question'],
    // The one filter that is never optional here. A chunk whose options
    // were never extracted is a question with no answers, and a
    // generator shown one learns to write questions with no answers.
    exemplarsOnly: true,
    excludeSourceDocumentIds: input.excludeSourceDocumentIds,
    difficulties: input.difficulties,
    assessmentObjectives: input.assessmentObjectives,
  }

  const perObjective = await Promise.all(
    objectives.map((objective) =>
      store.searchSimilarToChunk(objective.id, exemplarFilter, wanted)
    )
  )

  // A topic with no objectives stored still deserves exemplars, so fall
  // back to the filter alone rather than returning nothing.
  const candidates =
    objectives.length > 0
      ? perObjective.flat()
      : await store.listChunks(exemplarFilter, wanted)

  return bestPerChunk(candidates).slice(0, wanted)
}

// The same question is often the nearest neighbour of several
// objectives. Keep one copy, at its best distance, and order by that —
// a question that several objectives all point to is a better exemplar
// than one reached from a single angle.
function bestPerChunk(hits: SearchHit[]): SearchHit[] {
  const best = hits.reduce((map, hit) => {
    const seen = map.get(hit.id)
    if (!seen || (hit.distance ?? Infinity) < (seen.distance ?? Infinity)) {
      return map.set(hit.id, hit)
    }
    return map
  }, new Map<string, SearchHit>())

  return [...best.values()].sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
  )
}

function describeShortfall(
  context: TopicContext,
  topics: TopicRequirement[]
): string[] {
  const requirement = topics.find(
    (topic) => topic.topicNumber === context.topicNumber
  )
  const wanted = requirement?.exemplars ?? DEFAULT_EXEMPLARS_PER_TOPIC

  const shortfalls = [
    context.objectives.length === 0
      ? `Topic ${context.topicNumber}: no syllabus objectives stored, so exemplars were found by filter alone.`
      : undefined,
    context.exemplars.length < wanted
      ? `Topic ${context.topicNumber}: wanted ${wanted} exemplars, found ${context.exemplars.length}.`
      : undefined,
    context.insights.length === 0
      ? `Topic ${context.topicNumber}: no examiner commentary, so common mistakes are unknown.`
      : undefined,
  ]

  return shortfalls.filter((entry): entry is string => entry !== undefined)
}
