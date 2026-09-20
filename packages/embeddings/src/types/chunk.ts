import type { DifficultyBand } from '@education-ai/difficulty-estimation'
import type { KnowledgeMarkingPoint } from '@education-ai/knowledge-builder'
import type { QuestionOption } from '@education-ai/question-extraction'

// What kind of knowledge a chunk holds. Three types rather than one
// because they answer three different questions, and a single query
// rarely wants all three: "how has this been asked before" (question),
// "what must be taught" (learningObjective), "what do candidates get
// wrong" (examinerInsight). Mixing them into one chunk would make every
// vector a blurred average of the three.
export type ChunkType = 'question' | 'learningObjective' | 'examinerInsight'

// Whether an objective is assessed on every paper or only the Extended
// ones — the syllabus's own Core/Supplement split.
export type SyllabusTier = 'core' | 'supplement'

// The fields a retrieval query filters on. These become real SQL columns
// rather than JSON, because filtering and ranking in one query is the
// reason for choosing a vector database over a file of vectors.
//
// Almost everything is optional: a `learningObjective` chunk has no paper
// or question number, and a `question` chunk has no syllabus section.
// Each chunk fills what its own source knows.
export interface ChunkMetadata {
  // "0625"
  syllabusCode?: string

  // "41" — paper and variant, as the board prints it.
  paperCode?: string

  questionNumber?: number

  topicNumber?: number

  topicName?: string

  // "1.5" — sub-topic, on learning-objective chunks only.
  subTopicNumber?: string

  // "1.5.1" — section, on learning-objective chunks only.
  sectionNumber?: string

  tier?: SyllabusTier

  assessmentObjectives: string[]

  primaryAssessmentObjective?: string

  difficulty?: DifficultyBand

  marks?: number

  // Whether the source question references a figure, drawing or table.
  // Phase 7 needs it to avoid generating a question whose exemplar
  // depended on a picture this pipeline cannot yet reproduce.
  hasDiagram: boolean

  // Whether this chunk is fit to be shown to a generator as a model to
  // imitate. False when the extraction is known to be incomplete — most
  // often a multiple-choice question whose options were laid out around
  // a diagram rather than as lines, so the chunk holds a stem and none
  // of the answers that give it meaning.
  //
  // Such chunks are still stored and still retrievable: they are real
  // content, and a search for "what has been asked about diffraction"
  // should find them. What they must not do is become the pattern for a
  // newly generated question. Retrieval for generation filters on this;
  // retrieval for reading does not.
  isExemplar: boolean
}

// Everything a retrieved chunk should hand back but that is deliberately
// not embedded. Mark-scheme prose and examiner commentary would pull a
// question's vector toward how it is marked rather than what it asks, and
// no realistic query is looking for that — but any caller that retrieves
// the question wants them in the same round trip.
export interface ChunkPayload {
  correctAnswer?: string

  markingPoints?: KnowledgeMarkingPoint[]

  options?: QuestionOption[]

  examinerCommentary?: string

  commonMistakes?: string[]

  imageRefs?: string[]

  drawingRefs?: string[]

  tableRefs?: string[]
}

// One unit of knowledge, before it has a vector.
export interface Chunk {
  // Deterministic: "<sourceDocumentId>:<chunkType>:<key>". Deterministic
  // rather than random so that re-running the pipeline updates rows in
  // place instead of duplicating them.
  id: string

  chunkType: ChunkType

  // The `resourceId` of the document this came from — a question paper
  // for question and examinerInsight chunks, the syllabus for
  // learningObjective chunks.
  sourceDocumentId: string

  // Exactly the text that gets embedded, context header included. Stored
  // verbatim so a retrieved chunk can be read back and quoted, and so a
  // later model change can be re-run against the identical input.
  content: string

  // SHA-256 of `content`. Re-embedding is the only step in this pipeline
  // that costs money, so the hash is what lets a re-run skip it.
  contentHash: string

  metadata: ChunkMetadata

  payload: ChunkPayload
}
