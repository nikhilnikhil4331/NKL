import fs from "node:fs";
import path from "node:path";
import { restoreState } from "../src/persistence.js";

export function readState(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const state = restoreState(raw);
    if (state) return state;
    // Preserve invalid data rather than silently overwrite the only copy.
    fs.copyFileSync(file, `${file}.invalid-${Date.now()}.bak`);
  } catch (error) {
    // A permissions failure must be visible to the user, not treated as empty history.
    throw new Error(
      `Cannot read or back up the local data file: ${error.message}`,
    );
  }
  return null;
}
export function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(state));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
}
