export interface SyllabusTopic {
  number: number

  name: string
}

// One numbered learning objective from the syllabus's subject content —
// the statement of what a candidate should be able to do.
export interface LearningObjective {
  // Numbered continuously within a section, with Core and Supplement
  // sharing one sequence: where Core runs 1-8, Supplement starts at 9.
  number: number

  text: string
}

// A numbered section of a sub-topic, e.g. "1.5.1 Effects of forces".
//
// Sections exist because objective numbering restarts at each one:
// flattening "1.5 Forces" into a single list yields
// "1,2,3,4,5,6,7,8,1,2,3,4,1,2,3". A sub-topic that lists its objectives
// directly, with no numbered sections of its own, gets one implicit
// section carrying the sub-topic's own number and name — so every
// consumer can iterate sections without handling two shapes.
export interface SyllabusSection {
  // "1.5.1", or the sub-topic's own number for an implicit section.
  number: string

  // "Effects of forces", or the sub-topic's own name.
  name: string

  // Objectives every candidate is assessed on.
  core: LearningObjective[]

  // Additional objectives assessed only on the Extended papers. Empty
  // for a section with no Supplement content.
  supplement: LearningObjective[]
}

// A sub-topic of the subject content, e.g. "1.5 Forces".
export interface SyllabusSubTopic {
  // "1.5"
  number: string

  // 1 — the `SyllabusTopic` this belongs under.
  topicNumber: number

  // "Forces"
  name: string

  sections: SyllabusSection[]
}

export interface AssessmentObjective {
  // "AO1" | "AO2" | "AO3"
  code: string

  name: string

  // Bullet points only — connecting prose ("Candidates should be able
  // to...") is dropped. A deliberately partial extraction, not the full
  // paragraph text.
  description: string[]

  // Percentage weighting of the qualification. Undefined if the
  // weighting table wasn't found (should always be present in a real
  // syllabus, but the description and the weighting are extracted from
  // two different sections independently, so this stays optional rather
  // than assuming they'll always line up).
  weightingPercent?: number
}

// One row of the syllabus's "Command words" table. The board publishes
// these so candidates know what a question is asking for, which also
// makes them the most reliable deterministic signal available for what a
// question demands — see @education-ai/assessment-objective-mapping.
export interface CommandWord {
  // "Calculate" — as printed, capitalised.
  word: string

  // "work out from given facts, figures or information"
  meaning: string
}

export interface SyllabusOverviewMetadata {
  resourceId: string

  title: string

  pageCount: number

  extractedAt: Date

  extractorVersion: string
}

export interface SyllabusOverview {
  metadata: SyllabusOverviewMetadata

  topics: SyllabusTopic[]

  assessmentObjectives: AssessmentObjective[]

  // The published command-word glossary. Empty when the syllabus has no
  // such table — older syllabuses used a "glossary of terms" instead.
  commandWords: CommandWord[]

  // The subject-content hierarchy: each sub-topic with its Core and
  // Supplement learning objectives. Empty for a document without that
  // two-column table.
  subTopics: SyllabusSubTopic[]
}
