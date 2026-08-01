import { buildResourceId } from '../cambridge/lib/resource-id.js'
import { buildSubjectId } from '../cambridge/lib/subject-id.js'
import type {
  Board,
  DocumentResource,
  DocumentResourceMetadata,
  ExamSession,
} from '../cambridge/types.js'
import { classifyPastPaper } from './lib/classify-past-paper.js'
import type { RawPastPaper } from './lib/classify-past-paper.js'
import type { SaveMyExamsCourse } from './collect-course.js'

const BOARD: Board = 'Cambridge'

export interface SaveMyExamsSubjectInput {
  /** URL slug, e.g. "igcse". Passed straight through as metadata.qualification. */
  qualification: string
  /** URL slug, e.g. "physics". */
  subject: string
  /**
   * Ours, not scraped — savemyexams stamps every paper's own `code` field
   * with its own syllabus code, which may not match the one you want your
   * downloads filed under (see README for why).
   */
  syllabusCode: string
}

const SESSION_LABEL: Record<ExamSession, string> = {
  MJ: 'June',
  ON: 'November',
  FM: 'March',
}

/**
 * Maps savemyexams' raw past-paper records to `DocumentResource`s using the
 * exact same types/id scheme as the Cambridge job, so files land in the same
 * dataset tree. Does not download any files.
 */
export function collectResources(
  course: SaveMyExamsCourse,
  input: SaveMyExamsSubjectInput
): DocumentResource[] {
  const resources = course.pastPapers.flatMap((paper) =>
    toResources(paper, input)
  )

  return dedupeByUrl(resources)
}

function toResources(
  paper: RawPastPaper,
  input: SaveMyExamsSubjectInput
): DocumentResource[] {
  const classification = classifyPastPaper(paper)
  const { exam_paper: examPaperUrl, mark_scheme: markSchemeUrl } =
    paper.attributes

  const metadata: DocumentResourceMetadata = {
    board: BOARD,
    subjectId: buildSubjectId(BOARD, input.qualification, input.syllabusCode),
    qualification: input.qualification,
    subject: input.subject,
    syllabusCode: input.syllabusCode,
    year: classification.year,
    session: classification.session,
    paper: classification.paper,
    variant: classification.variant,
  }

  const title = buildTitle(classification, metadata)

  const questionPaper = examPaperUrl
    ? buildResource(
        classification.isSpecimen ? 'SPECIMEN_PAPER' : 'QUESTION_PAPER',
        `${title} Question Paper`,
        examPaperUrl,
        metadata
      )
    : undefined

  const markScheme = markSchemeUrl
    ? buildResource(
        'MARK_SCHEME',
        `${title} Mark Scheme`,
        markSchemeUrl,
        metadata
      )
    : undefined

  return [questionPaper, markScheme].filter(isDefined)
}

function buildResource(
  type: DocumentResource['type'],
  title: string,
  url: string,
  metadata: DocumentResourceMetadata
): DocumentResource {
  return {
    type,
    resourceId: buildResourceId(type, metadata),
    title,
    url,
    metadata,
  }
}

function buildTitle(
  classification: { year?: number; session?: ExamSession; isSpecimen: boolean },
  metadata: DocumentResourceMetadata
): string {
  const yearPart = classification.year ? `${classification.year}` : ''

  if (classification.isSpecimen) {
    return `${yearPart} Specimen Paper ${metadata.paper}`.trim()
  }

  const sessionPart = classification.session
    ? SESSION_LABEL[classification.session]
    : ''
  const variantPart =
    metadata.variant !== undefined
      ? `${metadata.paper}${metadata.variant}`
      : `${metadata.paper}`

  return `${sessionPart} ${yearPart} Paper ${variantPart}`
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeByUrl(resources: DocumentResource[]): DocumentResource[] {
  const byUrl = resources.reduce<Record<string, DocumentResource>>(
    (seen, resource) =>
      resource.url in seen ? seen : { ...seen, [resource.url]: resource },
    {}
  )

  return Object.values(byUrl)
}

function isDefined(
  value: DocumentResource | undefined
): value is DocumentResource {
  return value !== undefined
}
