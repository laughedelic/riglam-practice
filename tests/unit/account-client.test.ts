// A request to the server must end: a connection that never answers cannot leave a round of sync "Syncing ..." for good.
import { expect, test } from "vitest";
import { createAccountClient, type Fetch } from "../../src/account/client";
import { SyncError } from "../../src/account/sync";

// a server that takes the request and never answers; it gives up only when the client's signal says so, like a real fetch
const silent: Fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

test("a sync request that is never answered fails as offline after the wait", async () => {
  const client = createAccountClient(silent, 4000, 50);
  const started = Date.now();
  const failure = await client.sync({ cursor: 0, writes: [] }).then(() => null, (e: unknown) => e);
  expect(failure).toBeInstanceOf(SyncError);
  expect((failure as SyncError).code).toBe("offline");
  expect(Date.now() - started).toBeLessThan(2000);
});

test("an answer whose body never arrives ends the same way", async () => {
  const stuckBody: Fetch = (_input, init) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    } as unknown as Response);
  const failure = await createAccountClient(stuckBody, 4000, 50).sync({ cursor: 0, writes: [] }).then(() => null, (e: unknown) => e);
  expect((failure as SyncError).code).toBe("offline");
});

test("a quick answer is untouched by the wait", async () => {
  const fine: Fetch = async () => new Response(JSON.stringify({ cursor: 3, changes: [], rejected: [], more: false }), { status: 200 });
  expect(await createAccountClient(fine, 4000, 50).sync({ cursor: 0, writes: [] })).toEqual({ cursor: 3, changes: [], rejected: [], more: false });
});
