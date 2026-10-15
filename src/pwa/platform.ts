// PWA build: stands in for the Claude artifact frame.
//   db      local IndexedDB store (./local-db.ts)
//   sample  not available yet (no server): the page hides the check lab. Only `npm run dev` has one, a stand-in for the model
//           (./dev-sample.ts); `?ai=off` in the address takes it away there too.
//   tutor   the app's own server (./tutor.ts), when it has the tutor on and this device has the study group's key
//   account optional sign-in with a passkey and a server copy of the documents (./account.ts), when the server has accounts on
import dataUrl from "../data/drill-data.json?url";
import definitionsUrl from "../data/course-definitions.enc?url";
import { open, merge, lock } from "../data/course.js";
import type { Account, DrillData, Platform, Sample } from "../platform/types";
import { createPwaAccount } from "./account";
import { createLocalDb } from "./local-db";
import { createTutor, tutorIsOn } from "./tutor";
import { takeLinkKey, storedKey, storeKey, forgetKey, showUnlock } from "./unlock";

const db = createLocalDb();
const link = takeLinkKey(); // first of all: a key in the address leaves the address bar at once
let groupKey: string | null = null; // the key, once it has opened the definitions: the proof for the tutor is made with it

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
      groupKey = key;
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

/** `npm run dev` only: a stand-in for the model. `import.meta.env.DEV` is false in a build, so the module is not part of it (a unit test checks). */
async function sample(): Promise<Sample | null> {
  if (import.meta.env.DEV) {
    const mode = new URLSearchParams(location.search).get("ai");
    if (mode !== "off") return (await import("./dev-sample")).devSample(mode);
  }
  return null;
}

let account: Account | null = null;

export const pwaPlatform: Platform = {
  target: "pwa",
  loadData,
  db: async () => db,
  sample,
  // Only with the key (the server would refuse the request anyway) and only when the server says its tutor is on: otherwise the page hides the tutor.
  tutor: async () => (groupKey && (await tutorIsOn()) ? createTutor(groupKey) : null),
  // Made on first ask and then kept; it finds out for itself whether the server has accounts, so the page can show its row at once.
  account: async () => (account ??= createPwaAccount(db, () => groupKey)),
};
