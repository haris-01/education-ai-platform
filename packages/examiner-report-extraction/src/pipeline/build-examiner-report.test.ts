import { describe, expect, it } from 'vitest'

import { page, parsedDocument, textElement } from '../test-fixtures'
import { buildExaminerReport } from './build-examiner-report'

describe('buildExaminerReport', () => {
  it('extracts general comments and per-question comments for a paper', () => {
    const p = page(1, [
      textElement(
        1,
        'Cambridge International General Certificate of Secondary Education',
        147,
        14
      ),
      textElement(1, '0625 Physics June 2024', 243, 25),
      textElement(1, 'Principal Examiner Report for Teachers', 210, 37),
      textElement(1, 'PHYSICS', 57, 59),
      textElement(1, 'Paper 0625/11', 130, 125),
      textElement(1, 'Multiple Choice (Core)', 110, 141),
      textElement(1, 'General comments', 57, 200),
      textElement(1, 'Candidates demonstrated very good knowledge.', 57, 220),
      textElement(1, 'Comments on specific questions', 57, 250),
      textElement(1, 'Question 3', 57, 270),
      textElement(1, 'Candidates should be familiar with density.', 57, 290),
      textElement(1, 'Question 7', 57, 310),
      textElement(1, 'Many candidates struggled with power.', 57, 330),
      textElement(1, '© 2024', 506, 816),
    ])

    const { papers } = buildExaminerReport(parsedDocument([p]))

    expect(papers).toHaveLength(1)
    const [paper] = papers
    expect(paper.paperCode).toBe('0625/11')
    expect(paper.generalComments).toBe(
      'Candidates demonstrated very good knowledge.'
    )
    expect(paper.questionComments).toEqual([
      { questionNumber: 3, comment: 'Candidates should be familiar with density.' },
      { questionNumber: 7, comment: 'Many candidates struggled with power.' },
    ])
  })

  it('splits into separate papers and does not leak content across the boundary', () => {
    const p1 = page(1, [
      textElement(1, 'Paper 0625/11', 130, 125),
      textElement(1, 'General comments', 57, 200),
      textElement(1, 'First paper general comments.', 57, 220),
      textElement(1, 'Comments on specific questions', 57, 250),
      textElement(1, 'Question 1', 57, 270),
      textElement(1, 'First paper question one.', 57, 290),
    ])
    const p2 = page(2, [
      textElement(2, 'Paper 0625/12', 130, 125),
      textElement(2, 'General comments', 57, 200),
      textElement(2, 'Second paper general comments.', 57, 220),
      textElement(2, 'Comments on specific questions', 57, 250),
      textElement(2, 'Question 1', 57, 270),
      textElement(2, 'Second paper question one.', 57, 290),
    ])

    const { papers } = buildExaminerReport(parsedDocument([p1, p2]))

    expect(papers).toHaveLength(2)
    expect(papers[0].generalComments).toBe('First paper general comments.')
    expect(papers[0].questionComments).toEqual([
      { questionNumber: 1, comment: 'First paper question one.' },
    ])
    expect(papers[1].generalComments).toBe('Second paper general comments.')
    expect(papers[1].questionComments).toEqual([
      { questionNumber: 1, comment: 'Second paper question one.' },
    ])
  })

  it('does not let a page header or footer contaminate a comment across a page break', () => {
    const p1 = page(1, [
      textElement(1, 'Paper 0625/31', 130, 125),
      textElement(1, 'Comments on specific questions', 57, 250),
      textElement(1, 'Question 1', 57, 270),
      textElement(1, '(a) First part of the answer.', 57, 290),
      textElement(1, '© 2024', 506, 816),
    ])
    const p2 = page(2, [
      textElement(
        2,
        'Cambridge International General Certificate of Secondary Education',
        147,
        14
      ),
      textElement(2, '0625 Physics June 2024', 243, 25),
      textElement(2, 'Principal Examiner Report for Teachers', 210, 37),
      textElement(2, '(b) Second part of the answer, on the next page.', 57, 60),
    ])

    const { papers } = buildExaminerReport(parsedDocument([p1, p2]))

    expect(papers[0].questionComments).toEqual([
      {
        questionNumber: 1,
        comment:
          '(a) First part of the answer. (b) Second part of the answer, on the next page.',
      },
    ])
  })

  it('returns no papers when no "Paper NNNN/NN" marker is found', () => {
    const p = page(1, [textElement(1, 'Some other document', 57, 81)])
    expect(buildExaminerReport(parsedDocument([p])).papers).toEqual([])
  })
})
