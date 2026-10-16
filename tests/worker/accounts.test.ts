// Accounts signed in with a passkey (worker/accounts.ts): the ceremonies with a software authenticator, the sessions, and every refusal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_API } from "../../src/account/protocol";
import { testMagicKey as generateKey } from "../support/magic-key";
import { HEADER } from "../../src/ai/protocol";
import { makeProof, newDeviceId } from "../../src/ai/proof";
import { GUESSES_PER_HOUR } from "../../worker/magic";
import { COOKIE, MAX_SESSIONS, SESSION_MS, hashToken } from "../../worker/session";
import { passkey } from "./authenticator";
import { ORIGIN, WHERE, beforeStatement, cookieOf, signIn, signUp, world, type World } from "./accounts-support";
import { json } from "./support";

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const DAY = 86_400_000;

describe("who is signed in", () => {
  it("nobody, until someone signs in", async () => {
    const w = await world();
    expect(await json(await w.call(ACCOUNT_API.me))).toEqual({ signedIn: false });
  });

  it("knows the person by the cookie, with the name they chose and how many passkeys they have", async () => {
    const w = await world();
    const me = await signUp(w, "  Dorje   La ");
    const body = await json(await w.call(ACCOUNT_API.me, { cookie: me.cookie }));
    expect(body).toMatchObject({ signedIn: true, user: { id: me.id, name: "Dorje La", passkeys: 1 } });
    expect(Date.parse(body.user.createdAt)).toBe(w.clock.now.getTime());
  });

  it("does not know a cookie it did not give", async () => {
    const w = await world();
    await signUp(w);
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: `${COOKIE}=${"x".repeat(43)}` }))).toEqual({ signedIn: false });
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: `${COOKIE}=${"x".repeat(5000)}` }))).toEqual({ signedIn: false });
  });
});

describe("making an account", () => {
  it("verifies the passkey, stores the public key and a hash of the session, and gives a cookie only the server's pages can use", async () => {
    const w = await world();
    const pk = await passkey();
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: { name: "Tester" } }));
    expect(started.options).toMatchObject({ rp: { id: "practice.example" }, user: { name: "Tester" }, attestation: "none", authenticatorSelection: { residentKey: "required" } });
    const res = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) } });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{40,}; Path=/api; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict$`));
    const token = cookie.split(";")[0].split("=")[1];

    const users = w.db.sql<{ id: string; name: string }>("SELECT id, name FROM users");
    expect(users).toEqual([{ id: (await json(res)).user.id, name: "Tester" }]);
    expect(users[0].id).toBe(started.options.user.id); // the user handle is the account id
    const creds = w.db.sql<{ id: string; user_id: string; public_key: string; counter: number }>("SELECT id, user_id, public_key, counter FROM credentials");
    expect(creds).toHaveLength(1);
    expect(creds[0]).toMatchObject({ id: pk.id, user_id: users[0].id, counter: 0 });
    expect(creds[0].public_key.length).toBeGreaterThan(40);
    // only the hash of the token is kept
    const sessions = w.db.sql<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(sessions).toEqual([{ token_hash: await hashToken(token) }]);
    expect(JSON.stringify(w.db.sql("SELECT * FROM sessions"))).not.toContain(token);
  });

  it("uses a default name when none is given, and cuts a long one", async () => {
    const w = await world();
    await signUp(w, "");
    await signUp(w, "n".repeat(100));
    expect(w.db.sql<{ name: string }>("SELECT name FROM users ORDER BY created_at, name").map((r) => r.name.length).sort((a, b) => a - b)).toEqual([8, 40]);
    expect(w.db.sql<{ name: string }>("SELECT name FROM users").some((r) => r.name === "Practice")).toBe(true);
  });

  it("takes each challenge once", async () => {
    const w = await world();
    const pk = await passkey();
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
    const response = await pk.register(started.options, WHERE);
    expect((await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response } })).status).toBe(200);
    const again = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response } });
    expect(again.status).toBe(400);
    expect(w.db.sql("SELECT id FROM users")).toHaveLength(1);
  });

  it("refuses a challenge that is over", async () => {
    const w = await world();
    const pk = await passkey();
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
    w.clock.now = new Date(w.clock.now.getTime() + 6 * 60_000);
    const res = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) } });
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toMatch(/expired/);
    expect(w.db.sql("SELECT id FROM users")).toHaveLength(0);
  });

  it.each([
    ["a passkey made for another site", { origin: "https://evil.example" }],
    ["a response to another challenge", { challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }],
    ["a sign-in answer given as a sign-up", { type: "webauthn.get" }],
  ])("refuses %s", async (_name, over) => {
    const w = await world();
    const pk = await passkey();
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
    const res = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE, over) } });
    expect(res.status).toBe(400);
    expect(w.db.sql("SELECT id FROM users")).toHaveLength(0);
    expect(w.db.sql("SELECT token_hash FROM sessions")).toHaveLength(0);
  });

  it("refuses a passkey for the wrong host name", async () => {
    const w = await world();
    const pk = await passkey();
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
    const res = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, { origin: ORIGIN, rpID: "other.example" }) } });
    expect(res.status).toBe(400);
  });

  it("refuses a body that is not a sign-up, and an unknown challenge", async () => {
    const w = await world();
    expect((await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: "nope", response: {} } })).status).toBe(400);
    expect((await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: "x" } })).status).toBe(400);
    expect((await w.call(ACCOUNT_API.registerVerify, { body: [1, 2] })).status).toBe(400);
    expect((await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: "x", response: "y".repeat(120_000) } })).status).toBe(413);
  });

  it("does not make two accounts for one passkey", async () => {
    const w = await world();
    const pk = await passkey();
    await signUp(w, "One", pk);
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
    const res = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) } });
    expect(res.status).toBe(409);
    expect(w.db.sql("SELECT id FROM users")).toHaveLength(1);
  });

  it("limits the number of accounts", async () => {
    const w = await world({ MAX_ACCOUNTS: "2" });
    await signUp(w, "a");
    await signUp(w, "b");
    const res = await w.call(ACCOUNT_API.registerOptions, { body: {} });
    expect(res.status).toBe(429);
    expect((await json(res)).error.code).toBe("quota");
  });

  it("limits the sign-ups under way, so that asking for options cannot fill the table", async () => {
    const w = await world();
    for (let i = 0; i < 500; i++) w.db.sql(`INSERT INTO challenges (id, kind, challenge, expires_at) VALUES ('c${i}', 'login', 'x', '2027-01-01T00:00:00Z') RETURNING id`);
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(429);
    expect((await w.call(ACCOUNT_API.loginOptions, { body: {} })).status).toBe(429);
    // the ones that are over do not count
    w.clock.now = new Date("2028-01-01T00:00:00Z");
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(200);
  });

  it("takes at most so many sign-in and sign-up ceremonies a day from everybody together, and starts again the next day", async () => {
    const w = await world({ CEREMONIES_PER_DAY: "10" });
    for (let i = 0; i < 5; i++) expect((await w.call(ACCOUNT_API.loginOptions, { body: {} })).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(200);
    const over = await w.call(ACCOUNT_API.loginOptions, { body: {} });
    expect(over.status).toBe(429);
    expect((await json(over)).error.code).toBe("quota");
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(429);
    expect(w.db.sql("SELECT id FROM challenges")).toHaveLength(10); // the refused ones wrote nothing
    w.clock.now = new Date(w.clock.now.getTime() + DAY);
    expect((await w.call(ACCOUNT_API.loginOptions, { body: {} })).status).toBe(200);
  });

  it("counts the ceremonies a day in the statement, so that requests arriving together cannot pass the limit", async () => {
    const w = await world({ CEREMONIES_PER_DAY: "10" });
    const answers = await Promise.all(Array.from({ length: 25 }, () => w.call(ACCOUNT_API.loginOptions, { body: {} })));
    expect(answers.filter((r) => r.status === 200)).toHaveLength(10);
    expect(answers.filter((r) => r.status === 429)).toHaveLength(15);
    expect(w.db.sql("SELECT id FROM challenges")).toHaveLength(10);
  });

  it("keeps the ceremonies under way within the limit when the requests arrive together", async () => {
    const w = await world();
    for (let i = 0; i < 497; i++) w.db.sql(`INSERT INTO challenges (id, kind, challenge, expires_at) VALUES ('c${i}', 'login', 'x', '2027-01-01T00:00:00Z') RETURNING id`);
    const answers = await Promise.all(Array.from({ length: 8 }, () => w.call(ACCOUNT_API.loginOptions, { body: {} })));
    expect(answers.filter((r) => r.status === 200)).toHaveLength(3);
    expect(answers.filter((r) => r.status === 429)).toHaveLength(5);
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM challenges")[0].n).toBe(500);
  });

  it("gives the last place to one of the people who ask for it together, and leaves nothing of the others", async () => {
    const w = await world({ MAX_ACCOUNTS: "1" });
    const people = [await passkey(), await passkey(), await passkey()];
    const ready = [];
    for (const pk of people) {
      const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
      ready.push({ challengeId: started.challengeId, response: await pk.register(started.options, WHERE) });
    }
    const answers = await Promise.all(ready.map((body) => w.call(ACCOUNT_API.registerVerify, { body })));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 429, 429]);
    expect(w.db.sql("SELECT id FROM users")).toHaveLength(1);
    expect(w.db.sql("SELECT id FROM credentials")).toHaveLength(1);
    expect(w.db.sql("SELECT token_hash FROM sessions")).toHaveLength(1);
  });
});

describe("who may make an account", () => {
  it("anyone, by default", async () => {
    const w = await world();
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(200);
  });

  it("nobody when sign-up is closed, though existing accounts still sign in", async () => {
    const w = await world();
    const me = await signUp(w);
    const closed = await world({ SIGNUP: "closed" });
    const res = await closed.call(ACCOUNT_API.registerOptions, { body: {} });
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("not_granted");
    expect(me.id).toBeTruthy();
  });

  it("only the study group, when sign-up is for the group: the same proof as the tutor", async () => {
    const w = await world({ SIGNUP: "group" });
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(403);
    const wrong = await makeProof(generateKey(), w.device);
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {}, headers: { [HEADER.device]: w.device, [HEADER.proof]: wrong } })).status).toBe(403);
    const ok = await w.call(ACCOUNT_API.registerOptions, { body: {}, headers: { [HEADER.device]: w.device, [HEADER.proof]: w.proof } });
    expect(ok.status).toBe(200);
    // signing in needs no proof: the passkey is the credential
    const people = await world({ SIGNUP: "group" });
    const device = newDeviceId();
    const proof = await makeProof(people.key, device);
    const pk = await passkey();
    const started = await json(await people.call(ACCOUNT_API.registerOptions, { body: {}, headers: { [HEADER.device]: device, [HEADER.proof]: proof } }));
    const verified = await people.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) } });
    expect(verified.status).toBe(200);
    expect((await signIn(people, pk)).id).toBeTruthy();
  });

  it("a connection past the hourly limit on wrong keys is told to wait, not that its key is wrong", async () => {
    const w = await world({ SIGNUP: "group" });
    const wrong = await makeProof(generateKey(), w.device);
    const asks = (proof: string) => w.call(ACCOUNT_API.registerOptions, { body: {}, headers: { [HEADER.device]: w.device, [HEADER.proof]: proof } });
    for (let i = 0; i < GUESSES_PER_HOUR; i++) expect((await asks(wrong)).status).toBe(403);
    for (const proof of [wrong, w.proof]) {
      const blocked = await asks(proof);
      expect(blocked.status).toBe(429);
      expect((await json(blocked)).error.code).toBe("quota");
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    }
  });

  it("a guess that cannot be counted gets no verdict on the key: the same 503 for a proof that fits and one that does not", async () => {
    const w = await world({ SIGNUP: "group" });
    const db = w.env.DB as unknown as { prepare: (sql: string) => unknown };
    const real = db.prepare.bind(db);
    db.prepare = (sql: string) => (/INSERT INTO guesses/.test(sql) ? { bind: () => ({ run: () => Promise.reject(new Error("d1 is down")) }) } : real(sql));
    const wrong = await makeProof(generateKey(), w.device);
    for (const proof of [w.proof, wrong]) {
      const res = await w.call(ACCOUNT_API.registerOptions, { body: {}, headers: { [HEADER.device]: w.device, [HEADER.proof]: proof } });
      expect(res.status).toBe(503);
      expect((await json(res)).error.code).toBe("unavailable");
    }
  });

  it("not for the group when the server has no key to check the proof with", async () => {
    const w = await world({ SIGNUP: "group", RIGLAM_DATA_KEY: undefined });
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {}, headers: { [HEADER.device]: w.device, [HEADER.proof]: w.proof } })).status).toBe(403);
  });

  it("takes an unknown setting as open", async () => {
    const w = await world({ SIGNUP: "whenever" });
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(200);
  });
});

describe("signing in", () => {
  it("with the passkey alone: the server finds the account from the credential", async () => {
    const w = await world();
    const first = await signUp(w, "Tester");
    const again = await signIn(w, first.key);
    expect(again.id).toBe(first.id);
    expect(again.cookie).not.toBe(first.cookie);
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: again.cookie }))).toMatchObject({ signedIn: true, user: { name: "Tester" } });
    // both sessions work
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: first.cookie }))).toMatchObject({ signedIn: true });
  });

  it("keeps the counter the passkey reports, and when it was last used", async () => {
    const w = await world();
    const me = await signUp(w);
    await signIn(w, me.key);
    await signIn(w, me.key);
    const row = w.db.sql<{ counter: number; last_used_at: string }>("SELECT counter, last_used_at FROM credentials")[0];
    expect(row.counter).toBe(2);
    expect(row.last_used_at).toBe(w.clock.now.toISOString());
  });

  it("never lowers the counter: a sign-in that finishes after a later one leaves the higher number", async () => {
    const w = await world();
    const me = await signUp(w);
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    const response = await me.key.sign(started.options, WHERE); // counter 1
    // another sign-in, with a higher counter, is stored while this one is being checked
    beforeStatement(w, "UPDATE credentials SET counter", () => w.db.sql("UPDATE credentials SET counter = 5"));
    const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response } });
    expect(res.status).toBe(200);
    expect(w.db.sql<{ counter: number }>("SELECT counter FROM credentials")[0].counter).toBe(5);
  });

  it("ends the sessions that are over, and those beyond the newest few, so that sign-ins do not pile up", async () => {
    const w = await world();
    const me = await signUp(w);
    const sessions = () => w.db.sql<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id = ?", me.id).length;
    for (let i = 0; i < 25; i++) await signIn(w, me.key);
    expect(sessions()).toBe(MAX_SESSIONS);
    const last = await signIn(w, me.key);
    expect(sessions()).toBe(MAX_SESSIONS);
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: last.cookie }))).toMatchObject({ signedIn: true }); // the newest is the one that stays
    // sessions that are over go at the next sign-in, whatever their number
    w.clock.now = new Date(w.clock.now.getTime() + SESSION_MS + 1000);
    await signIn(w, me.key);
    expect(sessions()).toBe(1);
  });

  it("refuses a passkey the server does not have", async () => {
    const w = await world();
    await signUp(w);
    const stranger = await passkey();
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response: await stranger.sign(started.options, WHERE) } });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("unknown_passkey");
  });

  it("refuses a signature made with another key under a known passkey's id", async () => {
    const w = await world();
    const me = await signUp(w);
    const impostor = await passkey();
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    const response = { ...(await impostor.sign(started.options, WHERE)), id: me.key.id, rawId: me.key.id };
    const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response } });
    expect(res.status).toBe(400);
    expect(w.db.sql("SELECT token_hash FROM sessions")).toHaveLength(1); // only the one from signing up
  });

  it.each([
    ["another site", { origin: "https://evil.example" }],
    ["another challenge", { challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }],
    ["another account's handle", { userHandle: "zzzzzzzzzzzzzzzzzzzzzz" }],
  ])("refuses an answer made for %s", async (_name, over) => {
    const w = await world();
    const me = await signUp(w);
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response: await me.key.sign(started.options, WHERE, over) } });
    expect(res.status).toBe(400);
    expect(w.db.sql("SELECT token_hash FROM sessions")).toHaveLength(1);
  });

  it("takes each challenge once: an answer cannot be played back", async () => {
    const w = await world();
    const me = await signUp(w);
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    const response = await me.key.sign(started.options, WHERE);
    expect((await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response } })).status).toBe(200);
    expect((await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response } })).status).toBe(400);
  });

  it("will not take a sign-up challenge as a sign-in", async () => {
    const w = await world();
    const me = await signUp(w);
    const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: {} }));
    const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response: await me.key.sign(started.options, WHERE) } });
    expect(res.status).toBe(400);
  });

  it("asks for no account name: any passkey of the site can be offered", async () => {
    const w = await world();
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    expect(started.options.rpId).toBe("practice.example");
    expect(started.options.allowCredentials ?? []).toEqual([]);
  });
});

describe("sessions", () => {
  it("end sixty days after the last visit in their second half", async () => {
    const w = await world();
    const used = await signUp(w, "used");
    const idle = await signUp(w, "idle");
    w.clock.now = new Date(w.clock.now.getTime() + 59 * DAY);
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: used.cookie }))).toMatchObject({ signedIn: true }); // extended: now good for sixty more days
    w.clock.now = new Date(w.clock.now.getTime() + 2 * DAY); // day 61
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: used.cookie }))).toMatchObject({ signedIn: true });
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: idle.cookie }))).toEqual({ signedIn: false });
  });

  it("are extended when they are used in their second half, and not before", async () => {
    const w = await world();
    const me = await signUp(w);
    const before = w.db.sql<{ expires_at: string }>("SELECT expires_at FROM sessions")[0].expires_at;
    w.clock.now = new Date(w.clock.now.getTime() + 10 * DAY);
    await w.call(ACCOUNT_API.me, { cookie: me.cookie });
    expect(w.db.sql<{ expires_at: string }>("SELECT expires_at FROM sessions")[0].expires_at).toBe(before);
    w.clock.now = new Date(w.clock.now.getTime() + 25 * DAY);
    await w.call(ACCOUNT_API.me, { cookie: me.cookie });
    const after = w.db.sql<{ expires_at: string }>("SELECT expires_at FROM sessions")[0].expires_at;
    expect(Date.parse(after) - w.clock.now.getTime()).toBe(SESSION_MS);
  });

  it("extend the browser's cookie when the server extends them, on any request that uses the session, and not before", async () => {
    const w = await world();
    const me = await signUp(w);
    const token = me.cookie.split("=")[1];
    const get = (path: string) => w.call(path, { cookie: me.cookie, ...(path === ACCOUNT_API.sync ? { body: { cursor: 0, writes: [] } } : {}) });
    w.clock.now = new Date(w.clock.now.getTime() + 10 * DAY);
    for (const path of [ACCOUNT_API.me, ACCOUNT_API.sync]) expect((await get(path)).headers.get("set-cookie"), path).toBeNull();
    w.clock.now = new Date(w.clock.now.getTime() + 25 * DAY); // in the second half now
    const res = await get(ACCOUNT_API.sync);
    expect(res.status).toBe(200);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toContain(`${COOKIE}=${token}`);
    expect(header).toMatch(new RegExp(`Max-Age=${SESSION_MS / 1000}`));
    // extended on the server, so the next use finds more than half left
    expect((await get(ACCOUNT_API.me)).headers.get("set-cookie")).toBeNull();
    // and the other routes of the account do it too
    w.clock.now = new Date(w.clock.now.getTime() + 35 * DAY);
    expect((await get(ACCOUNT_API.me)).headers.get("set-cookie")).toContain(`${COOKIE}=${token}`);
  });

  it("end at sign-out, on the server too, and the cookie is cleared", async () => {
    const w = await world();
    const me = await signUp(w);
    const out = await w.call(ACCOUNT_API.logout, { method: "POST", body: {}, cookie: me.cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: me.cookie }))).toEqual({ signedIn: false });
    expect(w.db.sql("SELECT token_hash FROM sessions")).toHaveLength(0);
    // signing out when nobody is signed in is not an error
    expect((await w.call(ACCOUNT_API.logout, { method: "POST", body: {} })).status).toBe(200);
  });
});

describe("requests from other sites", () => {
  it.each([ACCOUNT_API.registerOptions, ACCOUNT_API.loginOptions, ACCOUNT_API.logout, ACCOUNT_API.sync])("%s is refused without the app's own origin", async (path) => {
    const w = await world();
    const me = await signUp(w);
    expect((await w.call(path, { method: "POST", body: {}, cookie: me.cookie, origin: null })).status).toBe(403);
    expect((await w.call(path, { method: "POST", body: {}, cookie: me.cookie, origin: "https://evil.example" })).status).toBe(403);
  });

  it("deleting the account is refused too", async () => {
    const w = await world();
    const me = await signUp(w);
    expect((await w.call(ACCOUNT_API.me, { method: "DELETE", cookie: me.cookie, origin: "https://evil.example" })).status).toBe(403);
    expect((await w.call(ACCOUNT_API.me, { method: "DELETE", cookie: me.cookie, origin: null })).status).toBe(403);
    expect(w.db.sql("SELECT id FROM users")).toHaveLength(1);
  });
});

describe("another passkey", () => {
  it("is added by a signed-in person, and either one signs in", async () => {
    const w = await world();
    const me = await signUp(w, "Tester");
    const second = await passkey();
    const started = await json(await w.call(ACCOUNT_API.passkeyOptions, { body: {}, cookie: me.cookie }));
    expect(started.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([me.key.id]);
    expect(started.options.user.id).toBe(me.id);
    const res = await w.call(ACCOUNT_API.passkeyVerify, { body: { challengeId: started.challengeId, response: await second.register(started.options, WHERE) }, cookie: me.cookie });
    expect(await json(res)).toEqual({ ok: true, passkeys: 2 });
    expect((await signIn(w, second)).id).toBe(me.id);
    expect((await signIn(w, me.key)).id).toBe(me.id);
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: me.cookie }))).toMatchObject({ user: { passkeys: 2 } });
  });

  it("needs a session", async () => {
    const w = await world();
    expect((await w.call(ACCOUNT_API.passkeyOptions, { body: {} })).status).toBe(401);
    expect((await w.call(ACCOUNT_API.passkeyVerify, { body: { challengeId: "x", response: {} } })).status).toBe(401);
  });

  it("cannot be someone else's challenge", async () => {
    const w = await world();
    const a = await signUp(w, "a");
    const b = await signUp(w, "b");
    const started = await json(await w.call(ACCOUNT_API.passkeyOptions, { body: {}, cookie: a.cookie }));
    const pk = await passkey();
    const res = await w.call(ACCOUNT_API.passkeyVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) }, cookie: b.cookie });
    expect(res.status).toBe(400);
    expect(w.db.sql<{ user_id: string }>("SELECT user_id FROM credentials WHERE id = ?", pk.id)).toHaveLength(0);
  });

  it("is limited to ten per account", async () => {
    const w = await world();
    const me = await signUp(w);
    for (let i = 0; i < 9; i++) {
      const started = await json(await w.call(ACCOUNT_API.passkeyOptions, { body: {}, cookie: me.cookie }));
      const pk = await passkey();
      expect((await w.call(ACCOUNT_API.passkeyVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) }, cookie: me.cookie })).status).toBe(200);
    }
    const started = await json(await w.call(ACCOUNT_API.passkeyOptions, { body: {}, cookie: me.cookie }));
    const res = await w.call(ACCOUNT_API.passkeyVerify, { body: { challengeId: started.challengeId, response: await (await passkey()).register(started.options, WHERE) }, cookie: me.cookie });
    expect(res.status).toBe(429);
  });
});

describe("accounts that are deleted or full while a request is under way", () => {
  const prepared = async (w: World, me: { cookie: string }, n: number) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const started = await json(await w.call(ACCOUNT_API.passkeyOptions, { body: {}, cookie: me.cookie }));
      out.push({ challengeId: started.challengeId, response: await (await passkey()).register(started.options, WHERE) });
    }
    return out;
  };

  it("stop at ten passkeys when the last places are asked for together", async () => {
    const w = await world();
    const me = await signUp(w);
    for (const body of await prepared(w, me, 8)) expect((await w.call(ACCOUNT_API.passkeyVerify, { body, cookie: me.cookie })).status).toBe(200);
    const together = await prepared(w, me, 4);
    const answers = await Promise.all(together.map((body) => w.call(ACCOUNT_API.passkeyVerify, { body, cookie: me.cookie })));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 429, 429, 429]);
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM credentials")[0].n).toBe(10);
  });

  it("leave no passkey behind for an account deleted while it was added", async () => {
    const w = await world();
    const me = await signUp(w);
    const [body] = await prepared(w, me, 1);
    beforeStatement(w, "INSERT INTO credentials", () => w.db.sql("DELETE FROM users"));
    const res = await w.call(ACCOUNT_API.passkeyVerify, { body, cookie: me.cookie });
    expect(res.status).toBe(401);
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM credentials")[0].n).toBe(1); // only the first one, which the deletion in this test did not touch
  });

  it("do not start a session for an account deleted while the sign-in was checked", async () => {
    const w = await world();
    const me = await signUp(w);
    w.db.sql("DELETE FROM sessions");
    const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
    const response = await me.key.sign(started.options, WHERE);
    beforeStatement(w, "INSERT INTO sessions", () => w.db.sql("DELETE FROM users"));
    const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response } });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(w.db.sql("SELECT token_hash FROM sessions")).toHaveLength(0);
  });
});

describe("deleting the account", () => {
  it("removes the account, its passkeys, sessions and documents, and nobody else's", async () => {
    const w = await world();
    const a = await signUp(w, "a");
    const b = await signUp(w, "b");
    await w.call(ACCOUNT_API.sync, { cookie: a.cookie, body: { cursor: 0, writes: [{ c: "answers", id: "x", doc: { at: "2026-10-13T00:00:00Z" }, t: w.clock.now.getTime() }] } });
    await w.call(ACCOUNT_API.sync, { cookie: b.cookie, body: { cursor: 0, writes: [{ c: "answers", id: "y", doc: { at: "2026-10-13T00:00:00Z" }, t: w.clock.now.getTime() }] } });
    await signIn(w, a.key);

    const res = await w.call(ACCOUNT_API.me, { method: "DELETE", cookie: a.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    // what is left is b's: one account, one passkey, one session, one document, one day's count
    for (const table of ["users", "credentials", "sessions", "docs", "sync_quota"]) {
      expect(w.db.sql<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)[0].n, table).toBe(1);
    }
    expect(w.db.sql<{ id: string }>("SELECT id FROM users")[0].id).toBe(b.id);
    expect(w.db.sql<{ id: string }>("SELECT id FROM docs")[0].id).toBe("y");
    expect(await json(await w.call(ACCOUNT_API.me, { cookie: a.cookie }))).toEqual({ signedIn: false });
  });

  it("needs a session", async () => {
    const w = await world();
    expect((await w.call(ACCOUNT_API.me, { method: "DELETE" })).status).toBe(401);
  });
});

describe("when accounts are off", () => {
  it("is off without a database, or until the migration has been applied, or when the operator says so", async () => {
    const none = await world({ DB: undefined });
    expect((await none.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(503);
    expect((await none.call(ACCOUNT_API.me)).status).toBe(503);
    expect(await json(await none.call("/api/health"))).toMatchObject({ accounts: "off" });

    const unmigrated = await world({ DB: { prepare: () => { throw new Error("no such table: users"); } } as unknown as D1Database });
    expect((await unmigrated.call(ACCOUNT_API.loginOptions, { body: {} })).status).toBe(503);

    const w = await world();
    const me = await signUp(w);
    expect(await json(await w.call("/api/health"))).toMatchObject({ accounts: "on" });
    w.db.sql("INSERT INTO settings (key, value) VALUES ('accounts', 'off') RETURNING key");
    expect(await json(await w.call("/api/health"))).toMatchObject({ accounts: "off" });
    expect((await w.call(ACCOUNT_API.registerOptions, { body: {} })).status).toBe(503);
    expect((await w.call(ACCOUNT_API.sync, { body: { cursor: 0, writes: [] }, cookie: me.cookie })).status).toBe(503);
    expect(cookieOf(await w.call(ACCOUNT_API.logout, { method: "POST", body: {} }))).toMatch(new RegExp(`^${COOKIE}=`));
  });

  it("does not stop the tutor, nor does the tutor's switch stop accounts", async () => {
    const w = await world();
    w.db.sql("INSERT INTO settings (key, value) VALUES ('tutor', 'off') RETURNING key");
    expect(await json(await w.call("/api/health"))).toEqual({ ok: true, tutor: "off", accounts: "on" });
  });
});
