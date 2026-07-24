import { createLogger, fetchWithRetry } from '@education-ai/shared'
import * as cheerio from 'cheerio'

import { buildSubjectId } from './lib/subject-id.js'
import type { Board, SubjectSections, SubjectMetadata } from './types.js'

const BOARD: Board = 'Cambridge'
const logger = createLogger('collect-subject')

const SECTION_LABEL_MAP: Array<{ match: RegExp; key: keyof SubjectSections }> =
  [
    { match: /past paper/i, key: 'pastPapers' },
    {
      match: /published resource|endorsed resource/i,
      key: 'publishedResources',
    },
    { match: /support/i, key: 'support' },
  ]

/**
 * Discovers metadata and section URLs for a single Cambridge subject page.
 * Does not download any documents — discovery only.
 */
export async function collectSubject(
  subjectUrl: string
): Promise<SubjectMetadata> {
  logger.info(`Fetching subject page: ${subjectUrl}`)

  const response = await fetchWithRetry(subjectUrl)
  const html = await response.text()
  const $ = cheerio.load(html)

  const { qualification, subject, syllabusCode } = parseHeading($, subjectUrl)
  const sections = discoverSections($, subjectUrl)
  const subjectId = buildSubjectId(BOARD, qualification, syllabusCode)

  logger.info(
    `Discovered ${subjectId} — ${qualification} ${subject} — sections: ${
      Object.keys(sections).join(', ') || 'none'
    }`
  )

  return {
    board: BOARD,
    subjectId,
    qualification,
    subject,
    syllabusCode,
    sections,
  }
}

function parseHeading(
  $: cheerio.CheerioAPI,
  subjectUrl: string
): { qualification: string; subject: string; syllabusCode: string } {
  const heading = $('.syllabus-overview--panel h1').first()

  const qualification = heading.find('.inner-heading').text().trim()

  const remainder = heading.clone()
  remainder.find('.inner-heading').remove()
  const subjectAndCode = remainder.text().trim()

  const match = subjectAndCode.match(/^(.*?)\s*\(([\w-]+)\)\s*$/)

  if (!qualification || !match) {
    throw new Error(`Unable to parse subject heading on page: ${subjectUrl}`)
  }

  return {
    qualification,
    subject: match[1].trim(),
    syllabusCode: match[2].trim(),
  }
}

function discoverSections(
  $: cheerio.CheerioAPI,
  subjectUrl: string
): SubjectSections {
  const basePath = subjectUrl.replace(/\/+$/, '')

  // Cambridge ships these tab links as root-relative fragments (e.g.
  // href="/past-papers") and stitches them onto the current subject's
  // base path via inline jQuery at render time. Resolving them with
  // standard URL rules (relative to origin) would land on the wrong
  // page, so we replicate the site's own concatenation here instead.
  const discovered = $('.landingLinks.within-context a')
    .toArray()
    .reduce<SubjectSections>((sections, element) => {
      const label = $(element).attr('title') ?? $(element).text()
      const href = $(element).attr('href')
      if (!href) {
        return sections
      }

      const entry = SECTION_LABEL_MAP.find(({ match }) => match.test(label))
      if (!entry) {
        return sections
      }

      return { ...sections, [entry.key]: `${basePath}${href}/` }
    }, {})

  // The subject page itself renders the syllabus overview (its "/view" tab
  // is a server-side redirect back to this same URL), so no extra fetch
  // is needed to discover the syllabus section.
  return {
    syllabus: `${basePath}/`,
    ...discovered,
  }
}
