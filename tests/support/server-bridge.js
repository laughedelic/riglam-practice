// Stands in for the app's server in the browser specs: the Worker itself (worker/app.ts) on a fake D1, in the test's own process,
// reached through page routes. Several pages can share one world (two devices of one person); each page has its own cookie jar,
// kept here by hand because a response made by a route does not set cookies in the browser.
import { createApp } from "../../worker/app.ts";
import { setup, seedCourse } from "../worker/support.ts";
import { hasCourse, readParts } from "../../scripts/lib/course-files.mjs";
import { dataKey } from "./data-key.js";

/** A server with its own empty database, holding the specs' Magic Key (and the course data when this run has it, or with `stubCourse` empty definitions, so that the key fits). `env` overrides the Worker's variables (SIGNUP, DAILY_WRITES_PER_ACCOUNT ...). `fetch` is what the Worker calls out with (a stand-in for Google's voices). */
export async function serverWorld(env = {}, { stubCourse = false, fetch = undefined } = {}) {
  const s = await setup({ RIGLAM_DATA_KEY: dataKey, ...env });
  if (hasCourse()) {
    const { definitions, notes } = readParts();
    await seedCourse(s.db.d1, { definitions: JSON.stringify(definitions), notes: JSON.stringify(notes) });
  } else if (stubCourse) {
    await seedCourse(s.db.d1, { definitions: "{}", notes: "{}" }); // a run without course data: the key still fits, the definitions are empty
  }
  return { app: createApp({ kit: async () => null, ...(fetch ? { fetch } : {}) }), env: s.env, sql: s.db.sql, offline: false, key: s.key };
}

/** Sends the page's requests to /api to the world; returns that page's cookie jar and the requests it made. */
export async function bridge(page, world) {
  const seen = [];
  const device = { jar: "", seen, offline: false };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    seen.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (world.offline || device.offline) return route.abort("connectionfailed");
    const headers = await request.allHeaders();
    delete headers["content-length"];
    if (device.jar) headers.cookie = device.jar;
    const res = await world.app.request(request.url(), { method: request.method(), headers, body: request.postData() ?? undefined }, world.env);
    const set = res.headers.get("set-cookie");
    if (set) device.jar = /Max-Age=0/i.test(set) ? "" : set.split(";")[0];
    const out = Object.fromEntries([...res.headers].filter(([k]) => k !== "set-cookie"));
    await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
  });
  return device;
}

/** A software authenticator for the page's browser context: passkeys are made and used without asking anyone. */
export async function virtualAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return {
    credentials: async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials,
    /** puts passkeys made elsewhere on this authenticator, as a passkey that syncs to another device would be */
    add: async (credentials) => {
      for (const credential of credentials) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
    },
  };
}
