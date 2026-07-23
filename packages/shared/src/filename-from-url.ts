import path from "node:path";

/**
 * Derives a filename from a URL's path, e.g.
 * ".../Images/570003-june-2024-examiner-report.pdf" -> "570003-june-2024-examiner-report.pdf".
 * Shared so `download()` (staging) and `store()` (predicting the final path
 * before downloading, to skip re-downloads) always agree on the same name.
 */
export function filenameFromUrl(url: string): string {
  const { pathname } = new URL(url);
  const name = path.basename(decodeURIComponent(pathname));
  return name.length > 0 ? name : `${Date.now()}.pdf`;
}
