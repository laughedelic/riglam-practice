// PWA build: stands in for the Claude artifact frame.
//   db      local IndexedDB store (./local-db.ts)
//   sample  not available yet (no server): the page hides the tutor, the check lab and "Explain"
import dataUrl from "../data/drill-data.json?url";
import definitionsUrl from "../data/course-definitions.enc?url";
import { open, merge, lock } from "../data/course.js";
import type { DrillData, Platform } from "../platform/types";
import { createLocalDb } from "./local-db";
import { takeLinkKey, storedKey, storeKey, forgetKey, showUnlock } from "./unlock";

const db = createLocalDb();
const link = takeLinkKey(); // first of all: a key in the address leaves the address bar at once

async function readDefinitions(key: string) {
  const res = await fetch(definitionsUrl);
  if (!res.ok) throw new Error("the definitions file is not available");
  const bytes = await res.arrayBuffer();
  try {
    return JSON.parse(await open(key, "definitions", bytes));
  } catch (e) {
    throw Object.assign(e as Error, { wrongKey: true });
  }
}

// The open data comes with the app. The definitions are encrypted in a second file that comes with it too (so both work offline);
// they are read when a key is at hand: from the link, or kept on this device from an earlier visit.
async function loadData(): Promise<DrillData> {
  const data = await (await fetch(dataUrl)).json();
  const key = link.key ?? storedKey();
  let problem = link.present && !link.key ? "That link has no valid key." : null;
  if (key) {
    try {
      const definitions = await readDefinitions(key);
      storeKey(key);
      return merge(data, definitions);
    } catch (e) {
      if ((e as { wrongKey?: boolean }).wrongKey) {
        forgetKey();
        problem = link.key ? "The key in that link does not open the definitions. Ask for a new link." : "The key kept on this device no longer opens the definitions.";
      } // any other failure (a file that could not be read) leaves the key alone and the definitions locked for this visit
    }
  }
  showUnlock({ problem, verify: readDefinitions });
  return lock(data);
}

export const pwaPlatform: Platform = {
  target: "pwa",
  loadData,
  db: async () => db,
  sample: async () => null,
};
