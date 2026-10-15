// The sentences of the Account row and the outbox contract (the IndexedDB version of the outbox is exercised in the browser spec).
import { describe, expect, it } from "vitest";
import type { AccountView } from "../../src/account/account";
import { memoryOutbox } from "../../src/account/outbox";
import { SYNC_COLLECTIONS } from "../../src/account/protocol";
import { COLLECTIONS } from "../../src/store/transfer";
import { signature, syncLine } from "../../src/ui/account";

const view = (sync: Partial<AccountView["sync"]> = {}, rest: Partial<AccountView> = {}): AccountView => ({
  available: true,
  supported: true,
  person: { id: "u", name: "n", passkeys: 1 },
  busy: null,
  message: null,
  sync: { active: true, busy: false, pending: 0, last: null, error: null, ...sync },
  ...rest,
});

describe("what the row says about sync", () => {
  it("says what is waiting and why", () => {
    expect(syncLine(view())).toBe("Not synced yet.");
    expect(syncLine(view({ last: Date.parse("2026-10-13T10:00:00Z") }))).toMatch(/^Up to date\. Last synced \d/);
    expect(syncLine(view({ pending: 1 }))).toBe("1 change is waiting to be sent.");
    expect(syncLine(view({ pending: 3, error: "offline" }))).toBe("No connection. 3 changes are waiting to be sent.");
    expect(syncLine(view({ error: "offline" }))).toMatch(/^No connection\. Changes made now will be sent/);
    expect(syncLine(view({ pending: 2, error: "quota" }))).toMatch(/limit of changes for today.*2 changes are waiting.*tomorrow/);
    expect(syncLine(view({ error: "unavailable" }))).toMatch(/could not be reached/);
    expect(syncLine(view({ busy: true, pending: 4 }))).toBe("Syncing ...");
  });

  it("rebuilds the screen only for what shows", () => {
    expect(signature(view())).toBe(signature(view()));
    expect(signature(view({ pending: 1 }))).not.toBe(signature(view()));
    expect(signature(view({}, { message: { text: "x", bad: false } }))).not.toBe(signature(view()));
  });
});

describe("the collections of a data file and of sync", () => {
  it("are the same list", () => expect([...COLLECTIONS]).toEqual([...SYNC_COLLECTIONS]));
});

describe("the outbox", () => {
  const entry = (id: string, t: number, doc: Record<string, unknown> | null = { v: t }) => ({ key: `answers/${id}`, c: "answers", id, doc, t });

  it("keeps one entry per document, oldest change first", async () => {
    const o = memoryOutbox();
    await o.put(entry("b", 20));
    await o.put(entry("a", 10));
    await o.put(entry("b", 30));
    expect((await o.list(10)).map((e) => [e.id, e.t])).toEqual([["a", 10], ["b", 30]]);
    expect((await o.list(1)).map((e) => e.id)).toEqual(["a"]);
    expect(await o.count()).toBe(2);
  });

  it("removes an entry only if it is still the one that was sent", async () => {
    const o = memoryOutbox();
    await o.put(entry("a", 10));
    await o.put(entry("a", 11)); // changed again while the first was on its way
    await o.remove("answers/a", 10);
    expect(await o.count()).toBe(1);
    await o.remove("answers/a", 11);
    expect(await o.count()).toBe(0);
  });

  it("adds without replacing, and clears the entries with the facts", async () => {
    const o = memoryOutbox();
    await o.putIfAbsent(entry("a", 10));
    await o.putIfAbsent(entry("a", 99));
    expect((await o.get("answers/a"))?.t).toBe(10);
    await o.setMeta("cursor", 7);
    expect(await o.getMeta("cursor")).toBe(7);
    await o.clear();
    expect([await o.count(), await o.getMeta("cursor")]).toEqual([0, undefined]);
  });
});
