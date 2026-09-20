import type { SearchHit } from '@education-ai/vector-store'

import type { TopicBrief } from '../types/generator'

// Turns a brief into the text a model is asked to answer.
//
// Built as a pure function returning a string, rather than assembled
// inside the generator, for one reason: a prompt is the least
// inspectable part of an AI system and the easiest to change by
// accident. As a pure function it can be asserted on — that the
// exemplars are present, that the instruction not to copy them is
// present, that a mark total is stated — without a network call.
export function buildGenerationPrompt(brief: TopicBrief): string {
  return [
    header(brief),
    syllabusSection(brief),
    exemplarSection(brief),
    insightSection(brief),
    rules(brief),
  ]
    .filter((section) => section.length > 0)
    .join('\n\n')
}

function header(brief: TopicBrief): string {
  const topic = brief.topicName
    ? `topic ${brief.topicNumber} (${brief.topicName})`
    : `topic ${brief.topicNumber}`

  return [
    `You are writing new examination questions for syllabus ${brief.syllabusCode}, ${topic}.`,
    `Write exactly ${brief.questionCount} question(s) worth ${brief.marks} marks in total.`,
    brief.multipleChoice
      ? 'These are multiple-choice questions: each needs four options labelled A to D with exactly one correct.'
      : 'These are structured questions: use lettered sub-parts where the question has more than one step.',
  ].join('\n')
}

function syllabusSection(brief: TopicBrief): string {
  if (brief.objectives.length === 0) {
    return ''
  }

  return [
    'The syllabus requires candidates to be able to:',
    ...brief.objectives.map((hit) => `- ${body(hit)}`),
  ].join('\n')
}

function exemplarSection(brief: TopicBrief): string {
  if (brief.exemplars.length === 0) {
    return ''
  }

  return [
    'Past questions from this board, for style, register and structure only:',
    ...brief.exemplars.map(
      (hit, index) => `--- Example ${index + 1} ---\n${body(hit)}`
    ),
  ].join('\n')
}

function insightSection(brief: TopicBrief): string {
  if (brief.insights.length === 0) {
    return ''
  }

  return [
    "Examiners' reports on what candidates get wrong here. Use these to make wrong answers plausible rather than obviously wrong:",
    ...brief.insights.map((hit) => `- ${body(hit)}`),
  ].join('\n')
}

function rules(brief: TopicBrief): string {
  return [
    'Rules:',
    // First and stated plainly, because it is the product's promise and
    // the instruction a model is most prone to soften into "inspired by".
    '- Write NEW questions. Do not reproduce, paraphrase, or rewrite an example. Changing the numbers in an example is not a new question.',
    // Both of these are from reading real output. A first run produced
    // "the behavior of water waves" for a British board, and opened
    // four stems with "This question is about...", which no Cambridge
    // paper does. A model writes plausible exam prose by default, not
    // this board's exam prose.
    '- Use British English spelling throughout (behaviour, metre, colour, ionisation).',
    '- Start each question with the situation or apparatus, exactly as a real paper does. Never open with "This question is about" or any similar announcement.',
    '- Every question must be answerable from the syllabus content above.',
    `- The marks across all questions must total exactly ${brief.marks}.`,
    '- Give a mark scheme for every question, saying what earns each mark.',
    '- State which assessment objective each question tests.',
    '- If a question needs a diagram, say so and describe what it must show. Do not refer to a figure you have not described.',
    ...(brief.assessmentObjectiveWeights
      ? [
          `- Distribute marks across assessment objectives roughly as: ${Object.entries(
            brief.assessmentObjectiveWeights
          )
            .map(([code, share]) => `${share}% ${code}`)
            .join(', ')}. Count marks, not questions.`,
        ]
      : []),
    ...(brief.difficultyMix
      ? [
          `- Aim for this spread of difficulty: ${Object.entries(
            brief.difficultyMix
          )
            .map(([band, share]) => `${share}% ${band}`)
            .join(', ')}.`,
        ]
      : []),
  ].join('\n')
}

// Chunks carry a one-line context header before a blank line. The
// header helped retrieval find them; inside a prompt it is noise that
// invites the model to copy the paper code.
function body(hit: SearchHit): string {
  const parts = hit.content.split('\n\n')

  if (parts.length < 2) {
    return hit.content.trim()
  }

  return parts.slice(1).join('\n\n').trim()
}
