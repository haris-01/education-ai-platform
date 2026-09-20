import type { Diagram } from '@education-ai/diagram-generation'

export interface PaperRenderOptions {
  // Figures to draw, keyed by question number.
  //
  // Passed in rather than carried on the paper, so a paper can be
  // stored, fetched and re-rendered without its diagrams, and so
  // drawing them — which costs a model call each — is a separate
  // decision from generating the questions.
  diagrams?: Map<number, Diagram>

  // Printed on the cover, e.g. "1 hour 15 minutes".
  duration?: string

  // Cover-page instructions, in the order they should appear. Defaults
  // to a Cambridge-style set when omitted.
  instructions?: string[]

  // Blank ruled space after each question, in millimetres per mark.
  // Cambridge gives roughly a line per mark; 8mm per mark is close and
  // keeps a 6-mark question on one page.
  answerSpacePerMark?: number

  // Draw the answer space at all. A mark scheme does not want it, and
  // an on-screen preview often does not either.
  includeAnswerSpace?: boolean
}
