import { describe, expect, it } from 'vitest'

import { buildSearchQuery } from './build-search-query'

describe('buildSearchQuery', () => {
  it('narrows by nothing when there is no filter', () => {
    expect(buildSearchQuery(undefined, 2)).toEqual({ clauses: [], params: [] })
    expect(buildSearchQuery({}, 2)).toEqual({ clauses: [], params: [] })
  })

  it('numbers placeholders from the given index', () => {
    // $1 is the query vector, so user filters have to start at $2.
    const query = buildSearchQuery({ syllabusCode: '0625', minMarks: 4 }, 2)

    expect(query.clauses).toEqual(['syllabus_code = $2', 'marks >= $3'])
    expect(query.params).toEqual(['0625', 4])
  })

  it('combines every filter with AND', () => {
    const query = buildSearchQuery(
      {
        chunkTypes: ['question'],
        topicNumbers: [1, 3],
        difficulties: ['high'],
        hasDiagram: false,
      },
      2
    )

    expect(query.clauses).toEqual([
      'chunk_type = ANY($2)',
      'topic_number = ANY($3)',
      'difficulty = ANY($4)',
      'has_diagram = $5',
    ])
    expect(query.params).toEqual([['question'], [1, 3], ['high'], false])
  })

  it('treats an empty array as no filter rather than as match-nothing', () => {
    // `= ANY('{}')` matches nothing, which is a confusing way to return
    // no results when the caller meant "do not narrow by this".
    expect(buildSearchQuery({ topicNumbers: [], paperCodes: [] }, 2)).toEqual({
      clauses: [],
      params: [],
    })
  })

  it('keeps hasDiagram: false, which is a real filter and not an absence', () => {
    expect(buildSearchQuery({ hasDiagram: false }, 2).params).toEqual([false])
  })

  it('overlaps assessment objectives rather than matching all of them', () => {
    const query = buildSearchQuery({ assessmentObjectives: ['AO2', 'AO3'] }, 2)

    expect(query.clauses).toEqual(['assessment_objectives && $2'])
  })

  it('narrows to exemplars when asked', () => {
    const query = buildSearchQuery({ exemplarsOnly: true }, 2)

    expect(query.clauses).toEqual(['is_exemplar = $2'])
    expect(query.params).toEqual([true])
  })

  it('treats exemplarsOnly: false as no filter, not as "only the broken ones"', () => {
    // Reading it the other way would silently return nothing but the
    // incomplete chunks, which is not a query anybody wants.
    expect(buildSearchQuery({ exemplarsOnly: false }, 2)).toEqual({
      clauses: [],
      params: [],
    })
  })

  it('excludes source documents by negation', () => {
    const query = buildSearchQuery(
      { excludeSourceDocumentIds: ['CAM-0625-MJ-2024-41-QP'] },
      2
    )

    expect(query.clauses).toEqual(['NOT (source_document_id = ANY($2))'])
  })
})
