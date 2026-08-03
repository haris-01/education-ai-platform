// Which syllabus topic a question belongs to. `undefined` topic fields mean
// no curated keyword scored above zero for this question — an honest
// "unclassified" rather than a guessed answer, since the classifier has no
// way to be confident when nothing matched.
export interface QuestionTopicAssignment {
  questionNumber: number

  topicNumber?: number

  topicName?: string

  // Keywords that contributed to the winning topic's score. Empty when
  // unclassified. Kept so a human can audit why a call was made without
  // re-running the matcher.
  matchedKeywords: string[]
}

export interface QuestionTopicMapMetadata {
  resourceId: string

  title: string

  extractedAt: Date

  extractorVersion: string
}

export interface QuestionTopicMap {
  metadata: QuestionTopicMapMetadata

  assignments: QuestionTopicAssignment[]
}
