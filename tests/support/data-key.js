// The data key for the browser tests (RIGLAM_DATA_KEY or .data-key); null when there is none. With a key the specs start the
// app unlocked; without one they run on the open data and the specs that need the definitions are skipped.
import { readKey } from "../../scripts/lib/course-files.mjs";

export const dataKey = readKey();
