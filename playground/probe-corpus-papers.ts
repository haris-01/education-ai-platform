// The whole June 2024 session, as inputs to assembleKnowledgeDocument.
// Shared by the embedding probes so a paper list does not drift between
// them. Papers 1-2 are multiple choice, 3-6 are marked from a table.
export const SESSION_DIR =
  'datasets/cambridge/igcse/physics/0625/past-papers/2024/mj'

export const SYLLABUS_PDF =
  'datasets/cambridge/igcse/physics/0625/syllabus/595430-2023-2025-syllabus.pdf'

export const EXAMINER_REPORT_PDF = `${SESSION_DIR}/570003-june-2024-examiner-report.pdf`

export const SYLLABUS_RESOURCE_ID = 'CAM-0625-SYLLABUS-2023-2025'

export interface CorpusPaper {
  paperCode: string
  questionPaper: string
  markScheme: string
  markSchemeType: 'mcq' | 'theory'
}

export const CORPUS_PAPERS: CorpusPaper[] = [
  {
    paperCode: '0625/11',
    questionPaper: `${SESSION_DIR}/11/570010-june-2024-question-paper-11.pdf`,
    markScheme: `${SESSION_DIR}/11/570004-june-2024-mark-scheme-paper-11.pdf`,
    markSchemeType: 'mcq',
  },
  {
    paperCode: '0625/21',
    questionPaper: `${SESSION_DIR}/21/570011-june-2024-question-paper-21.pdf`,
    markScheme: `${SESSION_DIR}/21/570005-june-2024-mark-scheme-paper-21.pdf`,
    markSchemeType: 'mcq',
  },
  {
    paperCode: '0625/31',
    questionPaper: `${SESSION_DIR}/31/570012-june-2024-question-paper-31.pdf`,
    markScheme: `${SESSION_DIR}/31/570006-june-2024-mark-scheme-paper-31.pdf`,
    markSchemeType: 'theory',
  },
  {
    paperCode: '0625/41',
    questionPaper: `${SESSION_DIR}/41/671385-june-2024-question-paper-41.pdf`,
    markScheme: `${SESSION_DIR}/41/671373-june-2024-mark-scheme-paper-41.pdf`,
    markSchemeType: 'theory',
  },
  {
    paperCode: '0625/51',
    questionPaper: `${SESSION_DIR}/51/671386-june-2024-question-paper-51.pdf`,
    markScheme: `${SESSION_DIR}/51/671374-june-2024-mark-scheme-paper-51.pdf`,
    markSchemeType: 'theory',
  },
  {
    paperCode: '0625/61',
    questionPaper: `${SESSION_DIR}/61/671387-june-2024-question-paper-61.pdf`,
    markScheme: `${SESSION_DIR}/61/671375-june-2024-mark-scheme-paper-61.pdf`,
    markSchemeType: 'theory',
  },
]
