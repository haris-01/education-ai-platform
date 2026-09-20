import type { SearchFilter } from '../types/vector-store'

export interface SearchQuery {
  clauses: string[]
  params: unknown[]
}

// Turns a filter into parameterised SQL. Built by reduction rather than
// by appending to arrays so each step carries the running placeholder
// index with it — `$1` is the query vector, so user filters start at $2.
export function buildSearchQuery(
  filter: SearchFilter | undefined,
  firstParamIndex: number
): SearchQuery {
  if (!filter) {
    return { clauses: [], params: [] }
  }

  const conditions: [string, unknown][] = [
    ...maybe(filter.chunkTypes, 'chunk_type = ANY(%s)'),
    ...maybe(filter.syllabusCode, 'syllabus_code = %s'),
    ...maybe(filter.paperCodes, 'paper_code = ANY(%s)'),
    ...maybe(filter.topicNumbers, 'topic_number = ANY(%s)'),
    ...maybe(filter.subTopicNumber, 'sub_topic_number = %s'),
    ...maybe(filter.tier, 'tier = %s'),
    ...maybe(filter.assessmentObjectives, 'assessment_objectives && %s'),
    ...maybe(filter.difficulties, 'difficulty = ANY(%s)'),
    ...maybe(filter.minMarks, 'marks >= %s'),
    ...maybe(filter.hasDiagram, 'has_diagram = %s'),
    ...maybe(exemplarValue(filter.exemplarsOnly), 'is_exemplar = %s'),
    ...maybe(
      filter.excludeSourceDocumentIds,
      'NOT (source_document_id = ANY(%s))'
    ),
  ]

  return conditions.reduce<SearchQuery>(
    (query, [template, value], index) => ({
      clauses: [
        ...query.clauses,
        template.replace('%s', `$${firstParamIndex + index}`),
      ],
      params: [...query.params, value],
    }),
    { clauses: [], params: [] }
  )
}

// `exemplarsOnly: true` means "only exemplars"; `false` means "do not
// narrow", not "only non-exemplars" — asking for the broken ones is not
// a query anybody wants, and reading it the other way would silently
// return nothing but junk.
function exemplarValue(exemplarsOnly: boolean | undefined): true | undefined {
  if (exemplarsOnly === true) {
    return true
  }

  return undefined
}

// An absent filter field means "do not narrow by this"; an empty array
// would otherwise compile to `= ANY('{}')` and match nothing, which is a
// confusing way to return no results.
function maybe<T>(value: T | undefined, template: string): [string, T][] {
  if (value === undefined) {
    return []
  }

  if (Array.isArray(value) && value.length === 0) {
    return []
  }

  return [[template, value]]
}
