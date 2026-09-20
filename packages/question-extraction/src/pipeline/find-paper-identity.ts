import type { ParsedDocument } from '@education-ai/document-ai'
import type { PaperIdentity } from '@education-ai/shared'
import { parsePaperCode } from '@education-ai/shared'

/**
 * Reads which paper a document is from off the document itself. Cambridge
 * prints the code on the front page ("0625/41") and again in every
 * subsequent page footer ("0625/41/M/J/24"), so this is a fact the PDF
 * states rather than something inferred.
 *
 * It matters because the paper number decides things no amount of reading
 * the question text can settle — papers 5 and 6 assess AO3 only, papers 1
 * and 2 are multiple choice, papers 3 and 4 are theory. Taking it from the
 * document removes those as hand-supplied arguments that can silently
 * disagree with the file actually being parsed.
 *
 * Returns `undefined` when no code is found, or when the codes found
 * disagree — an honest gap beats a coin flip for a field downstream
 * stages treat as ground truth.
 */
export function findPaperIdentity(
  document: ParsedDocument
): PaperIdentity | undefined {
  const found = document.pages.flatMap((page) =>
    page.textElements.flatMap((element) => {
      const identity = parsePaperCode(element.text)
      return identity ? [identity] : []
    })
  )

  if (found.length === 0) {
    return undefined
  }

  const [first] = found
  const allAgree = found.every(
    (identity) =>
      identity.syllabusCode === first.syllabusCode &&
      identity.code === first.code
  )

  return allAgree ? first : undefined
}
