import { createLogger } from '@education-ai/shared'
import { existsSync } from 'node:fs'

import { download, resolveStoredPath, store } from '../cambridge/index.js'
import { collectCourse } from './collect-course.js'
import { collectResources } from './collect-resources.js'
import type { SaveMyExamsSubjectInput } from './collect-resources.js'

const logger = createLogger('savemyexams-pipeline')

function buildPageUrl(input: SaveMyExamsSubjectInput): string {
  // CIE only for now — see README for what's needed to support other boards.
  return `https://www.savemyexams.com/${input.qualification}/${input.subject}/cie/past-papers/`
}

export async function collectSaveMyExams(
  input: SaveMyExamsSubjectInput
): Promise<void> {
  const pageUrl = buildPageUrl(input)
  const course = await collectCourse(pageUrl)
  const resources = collectResources(course, input)

  logger.info(
    `Processing ${resources.length} document(s) for ${input.subject} (${input.syllabusCode})`
  )

  // Sequential on purpose, same rationale as the Cambridge job: resources
  // here span several different mirror servers, and one failing shouldn't
  // abort the rest of the batch.
  for (const resource of resources) {
    try {
      if (existsSync(resolveStoredPath(resource))) {
        logger.info(`Already stored, skipping: ${resource.resourceId}`)
        continue
      }

      const file = await download(resource)
      await store(resource, file.filePath)
    } catch (error) {
      logger.error(
        `Failed to process ${resource.url}: ${(error as Error).message}`
      )
    }
  }

  logger.info('Pipeline complete.')
}

export { collectCourse } from './collect-course.js'
export { collectResources } from './collect-resources.js'
export type { SaveMyExamsSubjectInput } from './collect-resources.js'

const isCli = import.meta.url === `file://${process.argv[1]}`

if (isCli) {
  const [qualification, subject, syllabusCode] = process.argv.slice(2)

  if (!qualification || !subject || !syllabusCode) {
    console.error(
      [
        'Missing required arguments: <qualification> <subject> <syllabus-code>',
        '',
        'Usage (from the repo root, via pnpm — no -- needed):',
        '  pnpm --filter @education-ai/worker collect:savemyexams <qualification> <subject> <syllabus-code>',
        '',
        'Usage (from apps/worker, via npm — needs --):',
        '  npm run collect:savemyexams -- <qualification> <subject> <syllabus-code>',
        '',
        'Example:',
        '  pnpm --filter @education-ai/worker collect:savemyexams igcse physics 0625',
      ].join('\n')
    )
    process.exit(1)
  }

  collectSaveMyExams({ qualification, subject, syllabusCode }).catch(
    (error) => {
      console.error(error)
      process.exit(1)
    }
  )
}
