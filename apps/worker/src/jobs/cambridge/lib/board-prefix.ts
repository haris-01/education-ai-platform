import type { Board } from "../types.js";

const BOARD_PREFIXES: Record<Board, string> = {
  Cambridge: "CAM",
};

export function boardPrefix(board: Board): string {
  return BOARD_PREFIXES[board];
}
