// Builds the text that actually gets embedded: a one-line context header,
// a blank line, then the content.
//
// The header is why this function exists. A sub-part reading "Calculate
// the acceleration." is nearly contentless on its own — it could belong
// to half the syllabus, and its vector lands somewhere useless between
// every topic that mentions acceleration. Naming the paper and topic in
// the embedded text puts it where a topic-scoped query will find it. It
// costs a handful of tokens per chunk and is the single cheapest thing
// that improves retrieval.
export function composeChunkText(
  headerParts: (string | undefined)[],
  body: string
): string {
  const header = headerParts
    .flatMap((part) => (part && part.trim() ? [part.trim()] : []))
    .join(' — ')

  const content = body.trim()

  if (!header) {
    return content
  }

  return `${header}\n\n${content}`
}

// "Topic 1: Motion, forces and energy", or undefined when the question
// was never classified — topic-mapping leaves that gap open rather than
// guessing, and a header that said "Topic undefined" would embed noise.
export function topicLabel(
  topicNumber: number | undefined,
  topicName: string | undefined
): string | undefined {
  if (topicNumber === undefined) {
    return undefined
  }

  if (!topicName) {
    return `Topic ${topicNumber}`
  }

  return `Topic ${topicNumber}: ${topicName}`
}

// "Paper 0625/41". Undefined when the source document printed no code.
export function paperLabel(
  syllabusCode: string | undefined,
  code: string | undefined
): string | undefined {
  if (!syllabusCode || !code) {
    return undefined
  }

  return `Paper ${syllabusCode}/${code}`
}

// "6 marks" / "1 mark". Undefined when the paper stated no mark total,
// which happens on questions whose marks live only on their sub-parts.
export function marksLabel(marks: number | undefined): string | undefined {
  if (marks === undefined) {
    return undefined
  }

  if (marks === 1) {
    return '1 mark'
  }

  return `${marks} marks`
}
