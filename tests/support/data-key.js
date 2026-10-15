// The Magic Key for the browser specs: a random one per run, which the stand-in server accepts (serveCourse below). The real
// definitions come from data-private/ (docs/DATA.md); without that folder the specs that need them are skipped (`withCourse`),
// and the others run on the open data.
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
 */
export async function serveCourse(page, key = dataKey, { version = "v1" } = {}) {
  const calls = [];
  await page.route("**/api/course**", async (route) => {
    const request = route.request();
    const headers = request.headers();
    const have = new URL(request.url()).searchParams.get("have");
    const fits = await checkProof(key, headers["x-riglam-device"] ?? "", headers["x-riglam-proof"] ?? "");
    calls.push({ have, fits });
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!fits) return json(401, { error: { code: "not_granted", message: "the Magic Key does not match" } });
    if (!withCourse) return json(503, { error: { code: "unavailable", message: "no course data in this run" } });
    if (have === version) return json(200, { version, unchanged: true });
    return json(200, { version, definitions: readParts().definitions });
  });
  return calls;
}
