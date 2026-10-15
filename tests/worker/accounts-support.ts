// A Worker with accounts, and a person who can make one, for the account and sync tests.
import { createApp } from "../../worker/app";
import { ACCOUNT_API, type SyncChange, type SyncResponse } from "../../src/account/protocol";
import type { Env } from "../../worker/env";
import { passkey, type Passkey } from "./authenticator";
import { NOW, json, setup } from "./support";

export const ORIGIN = "https://practice.example";
export const WHERE = { origin: ORIGIN, rpID: "practice.example" };

export async function world(env: Partial<Env> = {}) {
  const s = await setup(env);
  const clock = { now: new Date(NOW) };
  const app = createApp({ kit: async () => null, now: () => clock.now });
  const call = (path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", ...init.headers };
    if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
    if (init.cookie) headers.cookie = init.cookie;
    return app.request(ORIGIN + path, { method: init.method ?? (init.body === undefined ? "GET" : "POST"), headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }, s.env);
  };
  return { ...s, app, clock, call };
}
export type World = Awaited<ReturnType<typeof world>>;

/** `name=value` of the session cookie a response sets, as a request sends it back. */
export const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

export interface Person {
  cookie: string;
  id: string;
  key: Passkey;
}

/** Makes an account with a new passkey and signs in. */
export async function signUp(w: World, name = "Tester", key?: Passkey): Promise<Person> {
  const pk = key ?? (await passkey());
  const started = await json(await w.call(ACCOUNT_API.registerOptions, { body: { name } }));
  const res = await w.call(ACCOUNT_API.registerVerify, { body: { challengeId: started.challengeId, response: await pk.register(started.options, WHERE) } });
  if (res.status !== 200) throw new Error("sign-up failed: " + (await res.text()));
  const body = await json(res);
  return { cookie: cookieOf(res), id: body.user.id, key: pk };
}

/** Signs in with a passkey the server knows. */
export async function signIn(w: World, key: Passkey): Promise<Person> {
  const started = await json(await w.call(ACCOUNT_API.loginOptions, { body: {} }));
  const res = await w.call(ACCOUNT_API.loginVerify, { body: { challengeId: started.challengeId, response: await key.sign(started.options, WHERE) } });
  if (res.status !== 200) throw new Error("sign-in failed: " + (await res.text()));
  const body = await json(res);
  return { cookie: cookieOf(res), id: body.user.id, key };
}

export const write = (c: string, id: string, doc: Record<string, unknown> | null, t: number): SyncChange => ({ c, id, doc, t });

/** One sync request of a signed-in person. */
export async function sync(w: World, who: Pick<Person, "cookie">, cursor: number, writes: SyncChange[] = []): Promise<SyncResponse> {
  const res = await w.call(ACCOUNT_API.sync, { cookie: who.cookie, body: { cursor, writes } });
  if (res.status !== 200) throw new Error("sync failed: " + res.status + " " + (await res.text()));
  return json(res);
}
