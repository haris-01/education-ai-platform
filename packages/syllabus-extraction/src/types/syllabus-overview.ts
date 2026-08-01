export interface SyllabusTopic {
  number: number

  name: string
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
}
