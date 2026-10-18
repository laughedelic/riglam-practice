// Which build this is and whether the server has a newer one (src/pwa/about.ts); the server is a fake fetch.
import { describe, expect, it } from "vitest";
import { aboutThisBuild } from "../../src/pwa/about";

const build = { version: "0.2.0", commit: "abc1234", builtAt: "2026-10-15T13:00:00.000Z" };
const serve = (files: Record<string, unknown>) =>
  (async (url: string) => (url in files ? new Response(JSON.stringify(files[url]), { status: 200 }) : new Response("not found", { status: 404 }))) as unknown as typeof fetch;

describe("aboutThisBuild", () => {
  it("says current when the server has the same commit", async () => {
    expect(await aboutThisBuild(build, serve({ "build.json": { ...build } }))).toEqual({ ...build, latest: "current", branches: undefined });
  });

  it("says newer when the server has another commit", async () => {
    expect((await aboutThisBuild(build, serve({ "build.json": { ...build, commit: "def5678" } }))).latest).toBe("newer");
  });

  it("lists the branches of a staging build", async () => {
    const about = await aboutThisBuild(build, serve({ "build.json": { ...build }, "staging-build.json": { commit: "x", branches: ["claude/a", "claude/b", 3] } }));
    expect(about.branches).toEqual(["claude/a", "claude/b"]);
  });

  it("does not know when offline, when the server answers with a page, or when it is slow", async () => {
    expect((await aboutThisBuild(build, (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).latest).toBe("unknown");
    expect((await aboutThisBuild(build, (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch)).latest).toBe("unknown");
    const slow = ((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))))) as unknown as typeof fetch;
    expect((await aboutThisBuild(build, slow, 20)).latest).toBe("unknown");
  });
});
