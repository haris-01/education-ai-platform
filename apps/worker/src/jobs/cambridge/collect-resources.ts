import { createLogger, fetchWithRetry } from "@education-ai/shared";
import * as cheerio from "cheerio";

import { classifyDocument } from "./lib/parse-document.js";
import { buildResourceId } from "./lib/resource-id.js";
import type { DocumentResource, DocumentResourceMetadata, SubjectMetadata } from "./types.js";

const logger = createLogger("collect-resources");

/**
 * Visits every section discovered by `collectSubject` and extracts metadata
 * for every downloadable document found. Does not download any files.
 */
export async function collectResources(subject: SubjectMetadata): Promise<DocumentResource[]> {
  const sectionUrls = uniqueSectionUrls(subject);

  const bySection = await Promise.all(
    sectionUrls.map((sectionUrl) => collectFromSection(sectionUrl, subject)),
  );

  const resources = dedupeByUrl(bySection.flat());

  logger.info(
    `Collected ${resources.length} document(s) across ${sectionUrls.length} section(s)`,
  );

  return resources;
}

function uniqueSectionUrls(subject: SubjectMetadata): string[] {
  return Array.from(new Set(Object.values(subject.sections).filter(isDefined)));
}

async function collectFromSection(
  sectionUrl: string,
  subject: SubjectMetadata,
): Promise<DocumentResource[]> {
  logger.info(`Scanning section: ${sectionUrl}`);

  let html: string;
  try {
    const response = await fetchWithRetry(sectionUrl);
    html = await response.text();
  } catch (error) {
    logger.warn(`Skipping section ${sectionUrl}: ${(error as Error).message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const resources: DocumentResource[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !isPdfLink(href)) return;

    const title = $(element)
      .text()
      .replace(/\(PDF[^)]*\)/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) return;

    const url = new URL(href, sectionUrl).toString();
    const classification = classifyDocument(title);

    const metadata: DocumentResourceMetadata = {
      board: subject.board,
      subjectId: subject.subjectId,
      qualification: subject.qualification,
      subject: subject.subject,
      syllabusCode: subject.syllabusCode,
      year: classification.year,
      session: classification.session,
      paper: classification.paper,
      variant: classification.variant,
    };

    resources.push({
      type: classification.type,
      resourceId: buildResourceId(classification.type, metadata),
      title,
      url,
      metadata,
    });
  });

  return resources;
}

function isPdfLink(href: string): boolean {
  return href.toLowerCase().split(/[?#]/)[0].endsWith(".pdf");
}

function dedupeByUrl(resources: DocumentResource[]): DocumentResource[] {
  const seen = new Map<string, DocumentResource>();
  for (const resource of resources) {
    if (!seen.has(resource.url)) {
      seen.set(resource.url, resource);
    }
  }
  return Array.from(seen.values());
}

function isDefined(value: string | undefined): value is string {
  return Boolean(value);
}
