import { existsSync } from "node:fs";
import path from "node:path";

const ROOT_MARKER = "pnpm-workspace.yaml";

/**
 * Walks upward from `startDir` to find the monorepo root, identified by
 * `pnpm-workspace.yaml`. Used to anchor shared output (e.g. datasets/) to a
 * stable location regardless of which directory a job is invoked from.
 */
export function resolveWorkspaceRoot(startDir: string): string {
  let dir = startDir;

  while (true) {
    if (existsSync(path.join(dir, ROOT_MARKER))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate workspace root (${ROOT_MARKER}) above ${startDir}`);
    }

    dir = parent;
  }
}
