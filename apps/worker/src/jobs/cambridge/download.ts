import { createLogger, fetchWithRetry, filenameFromUrl } from "@education-ai/shared";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DocumentResource, DownloadedDocument } from "./types.js";

const logger = createLogger("download");

// Staging area only. `store()` is responsible for placing the file into its
// final, deterministic dataset location.
const STAGING_DIR = path.join(tmpdir(), "education-ai-cambridge-downloads");

export async function download(resource: DocumentResource): Promise<DownloadedDocument> {
  const filename = filenameFromUrl(resource.url);
  const filePath = path.join(STAGING_DIR, filename);

  logger.info(`Downloading "${resource.title}" from ${resource.url}`);

  const response = await fetchWithRetry(resource.url);
  const buffer = Buffer.from(await response.arrayBuffer());

  await mkdir(STAGING_DIR, { recursive: true });
  await writeFile(filePath, buffer);

  logger.info(`Saved ${filename} (${buffer.byteLength} bytes)`);

  return { resource, filePath };
}
