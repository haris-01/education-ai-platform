import { createLogger, fetchWithRetry } from '@education-ai/shared'

import { extractNextData } from './lib/next-data.js'
import type { RawPastPaper } from './lib/classify-past-paper.js'

const logger = createLogger('collect-course')

interface SaveMyExamsNextData {
  props: {
    pageProps: {
      course?: {
        attributes?: {
          name?: string
          exam_code?: string
        }
      }
      pastPapers?: RawPastPaper[]
    }
  }
}

export interface SaveMyExamsCourse {
  courseName?: string
  examCode?: string
  pastPapers: RawPastPaper[]
}

/**
 * Fetches a savemyexams past-papers page and pulls the raw paper records out
 * of its embedded `__NEXT_DATA__` JSON. Does not download any documents —
 * discovery only, mirroring `collectSubject` in the Cambridge job.
 */
export async function collectCourse(
  pageUrl: string
): Promise<SaveMyExamsCourse> {
  logger.info(`Fetching past-papers page: ${pageUrl}`)

  const response = await fetchWithRetry(pageUrl)
  const html = await response.text()
  const data = extractNextData(html) as SaveMyExamsNextData

  const pastPapers = data.props.pageProps.pastPapers
  if (!Array.isArray(pastPapers)) {
    throw new Error(
      `Unable to find past-paper records on page (page structure may have changed): ${pageUrl}`
    )
  }

  const course = data.props.pageProps.course?.attributes
  logger.info(
    `Discovered ${pastPapers.length} past-paper record(s) for "${course?.name ?? 'unknown course'}" (exam code: ${course?.exam_code ?? 'unknown'})`
  )

  return {
    courseName: course?.name,
    examCode: course?.exam_code,
    pastPapers,
  }
}
