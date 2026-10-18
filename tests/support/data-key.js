// The Magic Key for the browser specs: a random one per run, which the stand-in servers accept (serveCourse below, and the Worker
// on a fake database in server-bridge.js). The real definitions come from data-private/ (docs/DATA.md); without that folder the
// specs that need them are skipped (`withCourse`), and the others run on the open data.
import { hasCourse, readParts } from "../../scripts/lib/course-files.mjs";
import { checkProof } from "../../src/ai/proof.ts";
import { testMagicKey } from "./magic-key.ts";

export const dataKey = testMagicKey();
export const withCourse = hasCourse();

/** The key as the specs store it on a device. */
export const KEY_STORE = "riglam.magicKey";

/**
 * Stands in for GET /api/course: the real definitions to a request whose proof was made with `key`, not_granted to any other.
 * `calls` collects the requests (their `have` query and whether the proof fitted). `version` is what the server says it holds.
 * `stub` serves no definitions at all in a run that has no course data, so that the key still fits: for a spec about something that
 * needs a device with the key but not the definitions (the flags).
 */
export async function serveCourse(page, key = dataKey, { version = "v1", stub = false } = {}) {
  const calls = [];
  await page.route("**/api/course**", async (route) => {
    const request = route.request();
    const headers = request.headers();
    const have = new URL(request.url()).searchParams.get("have");
    const fits = await checkProof(key, headers["x-riglam-device"] ?? "", headers["x-riglam-proof"] ?? "");
    calls.push({ have, fits });
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!fits) return json(401, { error: { code: "not_granted", message: "the Magic Key does not match" } });
    if (!withCourse && !stub) return json(503, { error: { code: "unavailable", message: "no course data in this run" } });
    if (have === version) return json(200, { version, unchanged: true });
    return json(200, { version, definitions: withCourse ? readParts().definitions : {} });
  });
  return calls;
}

/** Puts the Magic Key on the device before the page starts, and a stand-in server that accepts it also where the run has no course data. */
export async function giveKey(page) {
  await page.addInitScript(([store, key]) => {
    try {
      localStorage.setItem(store, key);
    } catch { /* storage unavailable */ }
  }, [KEY_STORE, dataKey]);
  return serveCourse(page, dataKey, { stub: true });
}
