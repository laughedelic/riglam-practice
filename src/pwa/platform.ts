// PWA build: stands in for the Claude artifact frame.
//   db      local IndexedDB store (./local-db.ts)
//   sample  not available (the tutor is the server's): only `npm run dev` has one, a stand-in for the model (./dev-sample.ts);
//           `?ai=off` in the address takes it away there too.
//   quorum  whether the app's server offers Quorum, the tutor's mode of several models and a judge: only a Preview does (docs/SERVER.md), and
//           only to a device that has the Magic Key. Otherwise the page has no Quorum.
//   unlock  a way to enter the Magic Key, while this device has none (./unlock.ts); the definitions come from the server (./course.ts)
//   examples the reference examples kept on this device, fetched from the server in the background once the key is known to fit (./course.ts)
//   keyHeld while it has one: enter another, or forget it (./unlock.ts)
//   tutor   the app's own server (./tutor.ts), when it has the tutor on and this device has the Magic Key
//   known   what that server learned of examples from earlier checks (./tutor.ts), when it answers from it (a Preview) and this device has the Magic Key
//   shares  whether that server keeps the examples the tutor checked, when this device has the Magic Key (the notice and the switch in Options)
//   reports flags sent to the app's own server (./reports.ts), when it takes them and this device has the Magic Key
//   account optional sign-in with a passkey and a server copy of the documents (./account.ts), when the server has accounts on
//   updates the service worker's new versions: checked in the background, started from the toast, the menu or Settings (./updates.ts)
import dataUrl from "../data/drill-data.json?url";
import { merge, lock } from "../data/course.js";
import type { Account, DrillData, Platform, Sample } from "../platform/types";
import { createPwaAccount } from "./account";
import { fetchCourse, fetchExamples, forgetCourse, keepCourse, keepExamples, keptCourse, keptExamples, whyNot, type Definitions } from "./course";
import { createAccountClient } from "../account/client";
import { aboutThisBuild } from "./about";
import { updates } from "./updates";
import { showStorageNotice } from "./storage-notice";
import { storeName } from "./store-slot";
import { createLocalDb } from "./local-db";
import { createReports, withdrawLater } from "./reports";
import { createKnown, createTutor, serverSays, type ServerSays } from "./tutor";
import { takeLinkKey, storedKey, storeKey, forgetKey, keyDeclined, declineKey, allowKey, showUnlock, markKeyChanged, takeKeyChanged, KEY_CHANGED_TEXT } from "./unlock";

const db = createLocalDb({ name: storeName(), onUnavailable: showStorageNotice });
const link = takeLinkKey(); // first of all: a key in the address leaves the address bar at once
let openUnlock: (() => Promise<boolean>) | null = null; // asks for the key again; set while this device has none
let groupKey: string | null = null; // the Magic Key, once it is known to fit (or kept with the definitions): the proof for the tutor is made with it
let serverAnswer: Promise<ServerSays> | null = null; // what the server says in /api/health: asked once, for the tutor, the grayed Explain button, Quorum and the flag reports
const serverSaid = () => (serverAnswer ??= serverSays());
const tutorIsOn = async () => (await serverSaid()).tutor;
const quorumOffered = async () => (await serverSaid()).quorum;
let openData: Promise<DrillData> | null = null; // the open part of the term data, read once
const readOpenData = () => (openData ??= fetch(dataUrl).then((r) => r.json()));
let unlocked: DrillData | null = null; // the term data with the definitions, once the prompt took a key into the running page: loadData answers with it from then on
const exampleListeners = new Set<() => void>(); // the page, which reads the examples again when a newer copy was kept
const keyListeners = new Set<() => void | Promise<void>>(); // the page, which reads the capabilities and the data again when a key was taken in place

// The open data comes with the app. The definitions come from the server to a device that has the Magic Key (from the link, or kept
// on this device from an earlier visit), and are kept on the device, so later visits open at once and work offline. A visit with a
// kept copy asks the server in the background whether the copy is current and the key still fits.
async function loadData(): Promise<DrillData> {
  if (unlocked) return unlocked;
  const data = await readOpenData();
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
      void refreshExamples(key);
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
  openUnlock = showUnlock({ problem, verify, apply: applyKey });
  return lock(data);
}

/** Background check of a kept copy. A key the server no longer accepts is forgotten, with the copy; a newer copy is kept for the next visit. */
async function refresh(key: string, have: string) {
  const got = await fetchCourse(key, have);
  // Another tab may have changed the key while this was under way: an answer for the old key says nothing about the new one, and must not erase or overwrite it.
  if (storedKey() !== key) return;
  if (got.ok) {
    if ("definitions" in got) keepCourse({ version: got.version, definitions: got.definitions as Definitions });
    void refreshExamples(key);
  } else if (got.reason === "not_granted") {
    forgetKey();
    forgetCourse();
    if (groupKey === key) groupKey = null; // the account's sign-in must not find the rejected key still held in memory
    if (await recoverFromAccount()) location.reload(); // the account carries the new key: start again with it
    else markKeyChanged(); // this visit still shows the kept copy; the next one explains and asks for the new key
  }
}

/**
 * Fetches the reference examples, or asks whether the kept copy is current. Called only after the server took the key, so a key that
 * does not fit costs one wrong guess, not two. Any failure leaves things as they are: the definitions' check is what forgets a key.
 */
async function refreshExamples(key: string) {
  const kept = keptExamples();
  const got = await fetchExamples(key, kept?.version);
  if (storedKey() !== key) return; // the key changed meanwhile: these belong to the old one
  if (got.ok && "examples" in got) {
    keepExamples({ version: got.version, examples: got.examples });
    for (const tell of exampleListeners) tell();
  }
}

/** The key the server stopped accepting may have been changed: an account that carries the key (and is signed in here) has the new one. */
async function recoverFromAccount(): Promise<boolean> {
  try {
    if (keyDeclined()) return false;
    const key = await createAccountClient().fetchKey();
    const got = await fetchCourse(key);
    if (!got.ok || !("definitions" in got)) return false;
    if (keyDeclined()) return false; // the reader forgot the key while this was under way: that wins (the check and the store below run with no wait between them)
    if (!storeKey(key)) return false; // nowhere to keep it: a reload would find the device without it and fetch it again, for ever
    keepCourse({ version: got.version, definitions: got.definitions });
    return true;
  } catch {
    return false;
  }
}

/** A device that signed in to an account which carries the Magic Key takes it and starts again, unlocked. */
function takeAccountKey(key: string) {
  if (storeKey(key)) location.reload(); // with nowhere to keep the key a reload would start locked again and fetch it again, for ever
}

/** For the Magic Key prompt: null when the key opens the definitions (they are kept, so a reload would start unlocked), otherwise what to tell the reader. */
async function verify(key: string): Promise<string | null> {
  const got = await fetchCourse(key);
  if (!got.ok) return whyNot(got);
  if ("definitions" in got) keepCourse({ version: got.version, definitions: got.definitions });
  return null;
}

/**
 * The prompt verified `key` and kept it with the definitions: take it into the running page, so that what the reader was doing stays
 * (the reload that used to follow lost the pair on the screen). The page is told through `onKey` and reads the data and the
 * capabilities again. False when that is not possible (the page does not listen yet, or there are no definitions): the caller reloads.
 */
async function applyKey(key: string): Promise<boolean> {
  const kept = keptCourse();
  if (!keyListeners.size || !kept) return false;
  unlocked = merge(await readOpenData(), kept.definitions);
  groupKey = key;
  void refreshExamples(key);
  link.key = null; // a key from the link that did not fit is out of the way now
  link.present = false;
  await Promise.all([...keyListeners].map((tell) => tell()));
  return true;
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
let changeKey: (() => Promise<boolean>) | null = null; // the prompt for another key, made when first asked for

/** The reader forgets the Magic Key on this device: the key and the kept definitions go, and the page starts again, locked. Answers and settings stay. */
function forgetEverything() {
  declineKey(); // an account that carries the key would hand it back at the next start
  forgetKey();
  forgetCourse();
  location.reload();
}

export const pwaPlatform: Platform = {
  target: "pwa",
  loadData,
  db: async () => db,
  sample,
  onKey(tell) {
    keyListeners.add(tell);
    return () => void keyListeners.delete(tell);
  },
  // Offered while there is no key: the page opens the prompt when the reader reaches something that needs it (Explain, the definitions, Options).
  unlock: async () => (groupKey || !openUnlock ? null : { open: openUnlock, tutor: false, answer: tutorIsOn() }),
  // While this device has the key: another one can be entered (the prompt keeps the old one until the new one is checked), or the key is forgotten, with the kept definitions.
  keyHeld: async () => (groupKey ? { change: () => (changeKey ??= showUnlock({ verify, apply: applyKey }))(), forget: forgetEverything } : null),
  // Only with the key (the server would refuse the request anyway) and only when the server says its tutor is on: otherwise the page hides the tutor.
  about: () => aboutThisBuild(),
  updates,
  tutor: async () => (groupKey && (await tutorIsOn()) ? createTutor(groupKey) : null),
  // Only with the key, and only when the server says it answers from what it learned (a Preview set to; docs/SERVER.md, "Learned facts").
  known: async () => (groupKey && (await serverSaid()).known ? createKnown(groupKey) : null),
  // Only with the key, and only when the server says it keeps the examples the tutor checked: the page then shows the notice and the switch.
  shares: async () => !!(groupKey && (await serverSaid()).learns),
  // Only with the key, like the tutor, and only when the server says it takes reports: otherwise flags stay on the device.
  reports: async () => (groupKey && (await serverSaid()).reports ? createReports(groupKey) : null),
  withdrawReport: withdrawLater,
  quorum: async () => (groupKey ? await quorumOffered() : false),
  // What an earlier visit (or this one, once the background fetch is done) kept; nothing without the key.
  examples: async () => (groupKey ? keptExamples()?.examples ?? null : null),
  onExamples(tell) {
    exampleListeners.add(tell);
    return () => void exampleListeners.delete(tell);
  },
  // Made on first ask and then kept; it finds out for itself whether the server has accounts, so the page can show its row at once.
  account: async () => (account ??= createPwaAccount(db, { read: () => groupKey ?? storedKey(), adopt: takeAccountKey, declined: keyDeclined, allow: allowKey })),
};
