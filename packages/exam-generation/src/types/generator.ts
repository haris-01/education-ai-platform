import type { DifficultyBand } from '@education-ai/difficulty-estimation'
import type { SearchHit } from '@education-ai/vector-store'

import type { GeneratedQuestion } from './generated-paper'

// Everything needed to write the questions for one topic.
//
// One topic at a time, not one paper. A whole paper in a single call is
// one long output where a mistake anywhere costs the lot, and it cannot
// be retried in part. Per topic, a failure is isolated, retryable, and
// cheap — and the retrieved context for one topic is small enough to
// fit comfortably in a prompt with room for the exemplars to matter.
export interface TopicBrief {
  syllabusCode: string

  topicNumber: number

  topicName?: string

  questionCount: number

  // Marks the whole topic should be worth, split across its questions
  // by the generator.
  marks: number

  // What the syllabus says must be taught here.
  objectives: SearchHit[]

  // Real questions to imitate. Never includes a chunk whose extraction
  // is known to be incomplete.
  exemplars: SearchHit[]

  // What candidates got wrong, in the examiner's words — so distractors
  // can be wrong in realistic ways rather than obviously wrong.
  insights: SearchHit[]

  // Target share of marks per objective, e.g. { AO1: 50, AO2: 30 }.
  //
  // The shares, not just the codes. A first run listed "AO1, AO2, AO3"
  // and came back 25/55/20 against a 50/30/20 specification — the model
  // had no way to know the proportions, so it picked whichever
  // objective each question suggested. Naming a target does not
  // guarantee hitting it, but omitting one guarantees missing it.
  assessmentObjectiveWeights?: Record<string, number>

  difficultyMix?: Partial<Record<DifficultyBand, number>>

  // True when the paper being modelled is multiple choice, so questions
  // need options rather than sub-parts.
  multipleChoice: boolean
}

// The one thing every question generator has to do.
//
// Deliberately the same shape as `Embedder`: a named model, and one
// method. Swapping Gemini for another provider, or for a local model,
// should be one new file.
export interface QuestionGenerator {
  readonly model: string

  // Returns questions numbered from 1 within the topic; the pipeline
  // renumbers them across the paper.
  generateTopic(brief: TopicBrief): Promise<GeneratedQuestion[]>
}
