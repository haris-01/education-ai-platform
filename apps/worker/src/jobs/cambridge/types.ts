/**
 * Shared types for the Cambridge resource collection pipeline.
 *
 * `Board` is a literal union so each supported exam board is an explicit,
 * checked value. Adding Edexcel/AQA/OCR later means extending this union,
 * not widening it to `string`.
 */

export type Board =
  | "Cambridge";
  // | "Edexcel"
  // | "AQA"
  // | "OCR"

export type DocumentType =
  | "SYLLABUS"
  | "QUESTION_PAPER"
  | "MARK_SCHEME"
  | "EXAMINER_REPORT"
  | "CONFIDENTIAL_INSTRUCTIONS"
  | "SPECIMEN_PAPER"
  | "OTHER";

export type ExamSession = "MJ" | "ON" | "FM";

export interface SubjectSections {
  syllabus?: string;
  pastPapers?: string;
  publishedResources?: string;
  support?: string;
}

export interface SubjectMetadata {
  board: Board;
  /** Stable subject identity, e.g. "CAM-IGCSE-0625". Prefer this over `subject` for identity/joins — display names change (e.g. "Physics" vs "Additional Physics"), syllabus codes don't. */
  subjectId: string;
  qualification: string;
  subject: string;
  syllabusCode: string;
  sections: SubjectSections;
}

export interface DocumentResourceMetadata {
  board: Board;
  subjectId: string;
  qualification: string;
  subject: string;
  syllabusCode: string;
  year?: number;
  session?: ExamSession;
  paper?: number;
  variant?: number;
}

export interface DocumentResource {
  type: DocumentType;
  /**
   * Stable, human-readable id, e.g. "CAM-0625-MJ-2024-41-QP" or
   * "CAM-0625-SYL-2026". Deterministic: derived solely from `type` and
   * `metadata`, so the same document always yields the same id. Treat as
   * immutable once generated — future storage layers should key on it,
   * never regenerate/overwrite it.
   */
  resourceId: string;
  title: string;
  url: string;
  metadata: DocumentResourceMetadata;
}

/** Result of `download()` — the resource plus where its bytes landed on disk. */
export interface DownloadedDocument {
  resource: DocumentResource;
  filePath: string;
}

/** Result of `store()` — where the file and its metadata ended up in the dataset. */
export interface StoredDocument {
  resource: DocumentResource;
  filePath: string;
  metadataFilePath: string;
}
