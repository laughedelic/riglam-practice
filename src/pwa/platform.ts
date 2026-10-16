// PWA build: stands in for the Claude artifact frame.
//   db      local IndexedDB store (./local-db.ts)
//   sample  not available yet (no server): the page hides the check lab. Only `npm run dev` has one, a stand-in for the model
//           (./dev-sample.ts); `?ai=off` in the address takes it away there too.
//   unlock  a way to enter the Magic Key, while this device has none (./unlock.ts); the definitions come from the server (./course.ts)
//   tutor   the app's own server (./tutor.ts), when it has the tutor on and this device has the Magic Key
//   account optional sign-in with a passkey and a server copy of the documents (./account.ts), when the server has accounts on
import dataUrl from "../data/drill-data.json?url";
import { merge, lock } from "../data/course.js";
import type { Account, DrillData, Platform, Sample } from "../platform/types";
import { createPwaAccount } from "./account";
import { fetchCourse, forgetCourse, keepCourse, keptCourse, whyNot, type Definitions } from "./course";
import { createAccountClient } from "../account/client";
import { createLocalDb } from "./local-db";
import { createTutor, tutorIsOn as serverSaysOn } from "./tutor";
import { takeLinkKey, storedKey, storeKey, forgetKey, showUnlock, markKeyChanged, takeKeyChanged, KEY_CHANGED_TEXT } from "./unlock";

const db = createLocalDb();
const link = takeLinkKey(); // first of all: a key in the address leaves the address bar at once
let openUnlock: (() => void) | null = null; // asks for the key again; set while this device has none
let groupKey: string | null = null; // the Magic Key, once it is known to fit (or kept with the definitions): the proof for the tutor is made with it
let serverAnswer: Promise<boolean> | null = null; // whether the server says its tutor is on: asked once, for the tutor and for the grayed Explain button
const tutorIsOn = () => (serverAnswer ??= serverSaysOn());

// The open data comes with the app. The definitions come from the server to a device that has the Magic Key (from the link, or kept
// on this device from an earlier visit), and are kept on the device, so later visits open at once and work offline. A visit with a
// kept copy asks the server in the background whether the copy is current and the key still fits.
async function loadData(): Promise<DrillData> {
  const data = await (await fetch(dataUrl)).json();
  const stored = storedKey();
  const key = link.key ?? stored;
  let problem = link.present && !link.key ? "That link has no Magic Key in it." : null;
  if (!key && !link.present && takeKeyChanged()) problem = KEY_CHANGED_TEXT; // the key was found out of date during an earlier visit: say so, once
  if (key) {
    // A link with a different key must not be answered from the copy kept for the old one; the same key again (a bookmark, a shortcut) is.
    const kept = !link.key || link.key === stored ? keptCourse() : null;
    if (kept) {
      groupKey = key;
      void refresh(key, kept.version);
      return merge(data, kept.definitions);
    }
    const got = await fetchCourse(key);
    if (got.ok && "definitions" in got) {
      groupKey = key;
      storeKey(key);
      keepCourse({ version: got.version, definitions: got.definitions });
      return merge(data, got.definitions);
    }
    if (!got.ok && got.reason === "not_granted") {
      forgetKey();
      forgetCourse();
      if (await recoverFromAccount()) {
        // the account carries the new key: start over with it (a key from the link, which did not fit, is out of the way now)
        link.key = null;
        link.present = false;
        return loadData();
      }
      problem = link.key ? "The Magic Key in that link does not fit. Ask for a new link." : KEY_CHANGED_TEXT;
    } else if (!got.ok) {
      // the server could not be asked (offline, too many tries, down): a key from a link is kept for the next visit, and the definitions stay locked for this one.
      // A copy kept for another key goes first: the next visit would otherwise open it as the definitions of this key before the server accepted it.
      if (link.key) {
        if (link.key !== stored) forgetCourse();
        storeKey(link.key);
      }
      if (link.key || got.reason === "rate_limited") problem = whyNot(got);
    }
  }
  openUnlock = showUnlock({ problem, verify });
  return lock(data);
}

/** Background check of a kept copy. A key the server no longer accepts is forgotten, with the copy; a newer copy is kept for the next visit. */
async function refresh(key: string, have: string) {
  const got = await fetchCourse(key, have);
  // Another tab may have changed the key while this was under way: an answer for the old key says nothing about the new one, and must not erase or overwrite it.
  if (storedKey() !== key) return;
  if (got.ok) {
    if ("definitions" in got) keepCourse({ version: got.version, definitions: got.definitions as Definitions });
  } else if (got.reason === "not_granted") {
    forgetKey();
    forgetCourse();
    if (await recoverFromAccount()) location.reload(); // the account carries the new key: start again with it
    else markKeyChanged(); // this visit still shows the kept copy; the next one explains and asks for the new key
  }
}

/** The key the server stopped accepting may have been changed: an account that carries the key (and is signed in here) has the new one. */
async function recoverFromAccount(): Promise<boolean> {
  try {
    const key = await createAccountClient().fetchKey();
    const got = await fetchCourse(key);
    if (!got.ok || !("definitions" in got)) return false;
    storeKey(key);
    keepCourse({ version: got.version, definitions: got.definitions });
    return true;
  } catch {
    return false;
  }
}

/** A device that signed in to an account which carries the Magic Key takes it and starts again, unlocked. */
function takeAccountKey(key: string) {
  storeKey(key);
  location.reload();
}

/** For the Magic Key prompt: null when the key opens the definitions (they are kept, so the reload that follows starts unlocked), otherwise what to tell the reader. */
async function verify(key: string): Promise<string | null> {
  const got = await fetchCourse(key);
  if (!got.ok) return whyNot(got);
  if ("definitions" in got) keepCourse({ version: got.version, definitions: got.definitions });
  return null;
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
  // Offered while there is no key: the page opens the prompt when the reader reaches something that needs it (Explain, the definitions, Options).
  unlock: async () => (groupKey || !openUnlock ? null : { open: openUnlock, tutor: false, answer: tutorIsOn() }),
  // Only with the key (the server would refuse the request anyway) and only when the server says its tutor is on: otherwise the page hides the tutor.
  tutor: async () => (groupKey && (await tutorIsOn()) ? createTutor(groupKey) : null),
  // Made on first ask and then kept; it finds out for itself whether the server has accounts, so the page can show its row at once.
  account: async () => (account ??= createPwaAccount(db, { read: () => groupKey ?? storedKey(), adopt: takeAccountKey })),
};
