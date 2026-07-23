import { createLogger } from "@education-ai/shared";
import { existsSync } from "node:fs";

import { collectResources } from "./collect-resources.js";
import { collectSubject } from "./collect-subject.js";
import { download } from "./download.js";
import { resolveStoredPath, store } from "./store.js";

const logger = createLogger("cambridge-pipeline");

export async function collectCambridgeSubject(subjectUrl: string): Promise<void> {
  const subject = await collectSubject(subjectUrl);
  const resources = await collectResources(subject);

  logger.info(`Processing ${resources.length} document(s) for ${subject.subject} (${subject.syllabusCode})`);

  for (const resource of resources) {
    try {
      // The dataset path is deterministic, so we can check whether a resource
      // is already on disk before downloading it, instead of re-fetching it
      // just to overwrite the same bytes.
      if (existsSync(resolveStoredPath(resource))) {
        logger.info(`Already stored, skipping: ${resource.resourceId}`);
        continue;
      }

      const file = await download(resource);
      await store(resource, file.filePath);
    } catch (error) {
      logger.error(`Failed to process ${resource.url}: ${(error as Error).message}`);
    }
  }

  logger.info("Pipeline complete.");
}

export { collectSubject } from "./collect-subject.js";
export { collectResources } from "./collect-resources.js";
export { download } from "./download.js";
export { resolveStoredPath, store } from "./store.js";
export type * from "./types.js";

const isCli = import.meta.url === `file://${process.argv[1]}`;

if (isCli) {
  const subjectUrl = process.argv[2];

  if (!subjectUrl) {
    console.error(
      [
        "Missing required argument: <cambridge-subject-url>",
        "",
        "Usage (from the repo root, via pnpm — no -- needed):",
        "  pnpm --filter @education-ai/worker collect:cambridge <cambridge-subject-url>",
        "",
        "Usage (from apps/worker, via npm — needs --):",
        "  npm run collect:cambridge -- <cambridge-subject-url>",
        "",
        "Example:",
        "  pnpm --filter @education-ai/worker collect:cambridge \\",
        "    https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/",
      ].join("\n"),
    );
    process.exit(1);
  }

  collectCambridgeSubject(subjectUrl).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
