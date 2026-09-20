// Boards occasionally withdraw a question after printing and leave a
// notice in its place: "Due to an issue with question 14, the question
// has been removed from the question paper." The notice occupies a
// question's slot and numbering, so every structural rule here treats it
// as a question — it has a number, it has text, it sits between 13 and
// 15.
//
// It is not a question, and downstream that matters: a generator shown
// this as an exemplar would learn to write administrative notices.
// Catching it is text recognition, which belongs here with the rest of
// the question identification, not in whatever happens to consume it.
const WITHDRAWAL_PHRASES = [
  'has been removed from the question paper',
  'has been removed from this question paper',
  'question has been withdrawn',
  'this question has been removed',
  'no question printed',
  'this page has been intentionally left blank',
]

// Deliberately conservative. Marking a real question as withdrawn would
// silently delete exam content, which is far worse than leaving a notice
// in the corpus — so a match must be the whole of a short body, not a
// phrase found somewhere inside a real question.
const MAX_NOTICE_LENGTH = 300

export function isWithdrawnNotice(
  text: string,
  hasParts: boolean,
  hasOptions: boolean
): boolean {
  // A withdrawn question has nothing under it. Anything carrying
  // sub-parts or answer options is a real question that happens to
  // mention removal.
  if (hasParts || hasOptions) {
    return false
  }

  const normalised = text.replace(/\s+/g, ' ').trim().toLowerCase()

  if (normalised.length === 0 || normalised.length > MAX_NOTICE_LENGTH) {
    return false
  }

  return WITHDRAWAL_PHRASES.some((phrase) => normalised.includes(phrase))
}
