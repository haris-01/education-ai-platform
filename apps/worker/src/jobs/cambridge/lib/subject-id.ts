import { boardPrefix } from "./board-prefix.js";
import type { Board } from "../types.js";

/**
 * Builds a stable subject identity, e.g. "CAM-IGCSE-0625". The syllabus code
 * is the durable identity for a subject — display names change over time
 * and syllabus revisions ("Physics" vs "Additional Physics" vs "Combined
 * Science (Physics)") and must never be used as a key.
 */
export function buildSubjectId(board: Board, qualification: string, syllabusCode: string): string {
  const qualificationCode = qualification
    .replace(/^cambridge\s+/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  return [boardPrefix(board), qualificationCode, syllabusCode].join("-");
}
