// Which assessment objective each published command word signals.
//
// The command words themselves are extracted from the syllabus (see
// syllabus-extraction's `commandWords`) — this table is only the part the
// syllabus does not state: which objective each one tests. Every entry
// below is justified by matching the syllabus's own command-word meaning
// against its own AO definition, quoted in the comments, rather than by
// intuition about the word in isolation.
//
// AO1 "Knowledge with understanding": demonstrate knowledge and
// understanding of phenomena, facts, laws, definitions, concepts and
// theories; vocabulary and conventions; instruments and apparatus.
//
// AO2 "Handling information and problem-solving": locate, select,
// organise and present information; translate it between forms;
// manipulate numerical data; identify patterns and form conclusions;
// present reasoned explanations; make predictions; solve problems.
//
// AO3 is deliberately absent. The syllabus assigns it by paper, not by
// command word — papers 5 and 6 are 100% AO3 and papers 1-4 are 0% — so
// it is applied as a paper-level rule in `assign-assessment-objectives`,
// where it belongs. The same command word means AO3 on paper 6 and AO2 on
// paper 4, which is exactly why this table cannot decide it.
//
// Subject-agnostic as written, but verified only against 0625. Other
// Cambridge sciences publish the same glossary, so this should carry over;
// other boards use different command words and will need their own table
// (see docs/BEST-CODING_PRACTICES.md on avoiding premature generalization).
export const COMMAND_WORD_OBJECTIVES: Record<string, string> = {
  // "give precise meaning" — AO1 names definitions outright.
  Define: 'AO1',

  // "express in clear terms" — recall, stated back.
  State: 'AO1',

  // "produce an answer from a given source or recall/memory" — recall.
  Give: 'AO1',

  // "name/select/recognise" — recognition of facts and vocabulary.
  Identify: 'AO1',

  // "state the points of a topic / give characteristics and main
  // features" — recall of phenomena and their features.
  Describe: 'AO1',

  // "work out from given facts, figures or information" — AO2's
  // "manipulate numerical and other data".
  Calculate: 'AO2',

  // "establish an answer using the information available" — AO2's "solve
  // problems" from supplied information.
  Determine: 'AO2',

  // "conclude from available information" — AO2's "form conclusions".
  Deduce: 'AO2',

  // "set out purposes or reasons / make the relationships between things
  // evident" — AO2's "present reasoned explanations for phenomena,
  // patterns and relationships".
  Explain: 'AO2',

  // "suggest what may happen based on available information" — AO2's
  // "make predictions based on relationships and patterns".
  Predict: 'AO2',

  // "apply knowledge and understanding to situations where there are a
  // range of valid responses" — applying to an unfamiliar context is the
  // line AO1's own description draws between recall and AO2.
  Suggest: 'AO2',

  // "identify/comment on similarities and/or differences" — AO2's "use
  // information to identify patterns".
  Compare: 'AO2',

  // "give an informed opinion" — reasoning over information, not recall.
  Comment: 'AO2',

  // "support a case with evidence/argument" — a reasoned explanation.
  Justify: 'AO2',

  // "Sketch" is deliberately absent. "Make a simple freehand drawing
  // showing the key features" is AO1 when the shape is recalled (a field
  // pattern) and AO2 when it is derived from data (a graph of supplied
  // readings), and the command word alone cannot tell those apart.
  // Leaving it out costs a signal; guessing would corrupt one.
}
