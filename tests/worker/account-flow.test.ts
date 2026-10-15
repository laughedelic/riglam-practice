// What the page does about an account (src/account/account.ts), with the real client and Worker and a software passkey:
// the actions, what each says, and what the device remembers when the app starts without a connection.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProof, newDeviceId } from "../../src/ai/proof";
import { HEADER } from "../../src/ai/protocol";
import { world } from "./accounts-support";
import { device, T0 } from "./device";
import { passkey } from "./authenticator";

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("creating an account", () => {
  it("makes the account, signs in and starts syncing", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("  Alexey's phone ");
    expect(a.account.view()).toMatchObject({ person: { name: "Alexey's phone", passkeys: 1 }, busy: null, message: { bad: false } });
    expect(a.kept).toMatchObject({ name: "Alexey's phone" });
    expect(a.sync.status().active).toBe(true);
    expect(a.cookie()).toMatch(/riglam-session/);
  });

  it("says so when the person closes the passkey dialog, and changes nothing", async () => {
    const w = await world();
    const a = await device(w);
    const { PasskeyError } = await import("../../src/account/passkeys");
    const fails = vi.spyOn(a.key, "register").mockRejectedValue(new PasskeyError("cancelled"));
    await a.account.signUp("x");
    expect(fails).toHaveBeenCalled();
    expect(a.account.view()).toMatchObject({ person: null, message: { text: expect.stringMatching(/cancelled/i), bad: false } });
    expect(w.db.sql("SELECT * FROM users")).toEqual([]);
  });

  it("is refused without the Magic Key when the app asks for it, and allowed with it", async () => {
    const w = await world({ SIGNUP: "group" } as never);
    const a = await device(w);
    await a.account.signUp("x");
    expect(a.account.view().message).toMatchObject({ bad: true, text: expect.stringMatching(/Magic Key/i) });
    expect(a.account.view().person).toBeNull();
    const id = newDeviceId();
    const b = await device(w, { proof: async () => ({ [HEADER.device]: id, [HEADER.proof]: await makeProof(w.key, id) }) });
    await b.account.signUp("x");
    expect(b.account.view().person).not.toBeNull();
  });

  it("is refused when sign-ups are closed", async () => {
    const w = await world({ SIGNUP: "closed" } as never);
    const a = await device(w);
    await a.account.signUp("x");
    expect(a.account.view()).toMatchObject({ person: null, message: { bad: true, text: expect.stringMatching(/closed/i) } });
  });

  it("does nothing while another action is running", async () => {
    const w = await world();
    const a = await device(w);
    await Promise.all([a.account.signUp("one"), a.account.signUp("two")]);
    expect(w.db.sql("SELECT name FROM users")).toEqual([{ name: "one" }]);
  });
});

describe("signing in", () => {
  it("accepts a passkey of the account from another device", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    const b = await device(w, { key: a.key });
    await b.account.signIn();
    expect(b.account.view().person).toMatchObject({ id: a.account.view().person!.id, name: "p" });
  });

  it("explains a passkey the server does not know", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    const stranger = await device(w, { key: await passkey() });
    await stranger.account.signIn();
    expect(stranger.account.view()).toMatchObject({ person: null, message: { bad: true, text: expect.stringMatching(/does not know that passkey/i) } });
  });
});

describe("passkeys of the account", () => {
  it("adds another one and shows the count", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    const second = await passkey();
    a.key = second;
    await a.account.addPasskey();
    expect(a.account.view().person?.passkeys).toBe(2);
    expect(a.kept?.passkeys).toBe(2);
    const b = await device(w, { key: second });
    await b.account.signIn();
    expect(b.account.view().person?.id).toBe(a.account.view().person?.id);
  });
});

describe("leaving", () => {
  it("signing out needs the server and says so when it cannot be reached", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    a.offline = true;
    await a.account.signOut();
    expect(a.account.view()).toMatchObject({ person: { name: "p" }, message: { bad: true, text: expect.stringMatching(/no connection/i) } });
    a.offline = false;
    await a.account.signOut();
    expect(a.account.view().person).toBeNull();
    expect(a.kept).toBeNull();
    expect(a.cookie()).toBe("");
  });

  it("deleting removes the server copy and the session", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    await a.put("answers", "a1", { v: 1 }, T0);
    await a.sync.syncNow();
    expect(w.db.sql("SELECT * FROM docs")).toHaveLength(1);
    await a.account.deleteAccount();
    expect(w.db.sql("SELECT * FROM users")).toEqual([]);
    expect(w.db.sql("SELECT * FROM docs")).toEqual([]);
    expect(a.account.view()).toMatchObject({ person: null, message: { bad: false } });
  });
});

describe("starting the app", () => {
  it("shows nothing when the server has accounts off and this device never used one", async () => {
    const w = await world();
    await w.db.d1.prepare("INSERT INTO settings (key, value) VALUES ('accounts', 'off')").run();
    const a = await device(w);
    await a.account.start();
    expect(a.account.view()).toMatchObject({ available: false, person: null });
  });

  it("shows the row when accounts are on", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.start();
    expect(a.account.view()).toMatchObject({ available: true, person: null });
    expect(a.calls.filter((c) => c.includes("/api/account"))).toEqual([]); // nobody asked about an account that was never used
  });

  it("remembers who was signed in when there is no connection, keeps queueing, and sends when the connection returns", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    // a new visit of the same device: same store, outbox and remembered person, a new account object
    const { createAccount } = await import("../../src/account/account");
    const again = createAccount({ client: a.client, sync: a.sync, passkeys: { supported: () => true, create: async () => ({}), get: async () => ({}) }, keep: { read: () => a.kept, write: (p) => void (a.kept = p) } });
    a.offline = true;
    await again.start();
    expect(again.view()).toMatchObject({ available: true, person: { name: "p" } });
    await a.put("answers", "a1", { v: 1 }, T0);
    expect(await a.outbox.count()).toBe(1);
    a.offline = false;
    await again.syncNow();
    expect(w.db.sql("SELECT id FROM docs")).toEqual([{ id: "a1" }]);
  });

  it("notices that the session ended while the app was closed", async () => {
    const w = await world();
    const a = await device(w);
    await a.account.signUp("p");
    a.clearCookie();
    const { createAccount } = await import("../../src/account/account");
    const again = createAccount({ client: a.client, sync: a.sync, passkeys: { supported: () => true, create: async () => ({}), get: async () => ({}) }, keep: { read: () => a.kept, write: (p) => void (a.kept = p) } });
    await again.start();
    await vi.waitFor(() => expect(again.view().person).toBeNull());
    expect(again.view().message?.text).toMatch(/signed out/i);
    expect(a.kept).toBeNull();
  });
});

describe("the account carries the Magic Key", () => {
  const withKey = (w: Awaited<ReturnType<typeof world>>) => {
    const id = newDeviceId();
    return {
      proof: async () => ({ [HEADER.device]: id, [HEADER.proof]: await makeProof(w.key, id) }),
    };
  };

  it("a device that has the key makes its account carry it; a device that signs in without the key gets it", async () => {
    const w = await world();
    const adopted: string[] = [];
    const a = await device(w, { ...withKey(w), magicKey: { read: () => w.key, adopt: (k) => void adopted.push(k) } });
    await a.account.signUp("p");
    expect(a.account.view().person).toMatchObject({ hasKey: true });
    expect(a.kept).toMatchObject({ hasKey: true });
    expect(w.db.sql("SELECT has_key FROM users")).toEqual([{ has_key: 1 }]);
    expect(adopted).toEqual([]);

    const taken: string[] = [];
    const b = await device(w, { key: a.key, magicKey: { read: () => null, adopt: (k) => void taken.push(k) } });
    await b.account.signIn();
    expect(taken).toEqual([w.key]);
    expect(b.account.view().person).toMatchObject({ hasKey: true });
  });

  it("a key that is changed on the server is still handed to the account's devices", async () => {
    const w = await world();
    const a = await device(w, { ...withKey(w), magicKey: { read: () => w.key, adopt: () => {} } });
    await a.account.signUp("p");
    const changed = "river-candle-stone-lotus";
    (w.env as { RIGLAM_DATA_KEY: string }).RIGLAM_DATA_KEY = changed;
    expect(await a.client.fetchKey()).toBe(changed);
  });

  it("an account that never showed the key is not given it, and a wrong proof does not make it carry the key", async () => {
    const w = await world();
    const a = await device(w, { magicKey: { read: () => null, adopt: () => {} } });
    await a.account.signUp("p");
    expect(a.account.view().person).toMatchObject({ hasKey: false });
    await expect(a.client.fetchKey()).rejects.toMatchObject({ code: "not_granted" });
    const id = newDeviceId();
    await expect(a.client.shareKey({ [HEADER.device]: id, [HEADER.proof]: await makeProof("wrong-words-in-here", id) })).rejects.toMatchObject({ code: "not_granted" });
    expect(w.db.sql("SELECT has_key FROM users")).toEqual([{ has_key: 0 }]);
  });

  it("is refused without a session", async () => {
    const w = await world();
    const a = await device(w);
    await expect(a.client.fetchKey()).rejects.toMatchObject({ code: "signed_out" });
    await expect(a.client.shareKey({})).rejects.toMatchObject({ code: "signed_out" });
  });
});
