// Boards print a copyright acknowledgement after the last question, in
// the same text flow and with no heading to separate it. Nothing
// structural marks where the paper stops being a paper, so the last
// question on every Cambridge paper absorbs about 700 characters of
// legal boilerplate into its stem:
//
//   "What is a light-year? Permission to reproduce items where
//    third-party owned material protected by copyright is included..."
//
// It survived every earlier phase because it is well-formed prose
// attached to a real question. It showed up when pairwise similarity
// across the corpus put three unrelated questions at 0.55 — they had
// nothing in common except this.
//
// Truncation happens at the first recognised opener, so anything the
// board prints after it goes too, which is what is wanted: everything
// past that point is administrative.
const BACK_MATTER_OPENERS = [
  'permission to reproduce items where third-party owned material',
  'permission to reproduce items where third party owned material',
  'to avoid the issue of disclosure of answer-related information',
  'cambridge assessment international education is part of cambridge assessment',
  'cambridge international is part of cambridge assessment',
  'blank page',
]

export function stripBackMatter(text: string): string {
  const lowered = text.toLowerCase()

  const cut = BACK_MATTER_OPENERS.reduce((earliest, opener) => {
    const at = lowered.indexOf(opener)

    if (at === -1) {
      return earliest
    }

    return earliest === -1 ? at : Math.min(earliest, at)
  }, -1)

  if (cut === -1) {
    return text
  }

  return text.slice(0, cut).trim()
}
