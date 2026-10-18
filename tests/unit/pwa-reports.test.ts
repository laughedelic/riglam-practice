// The PWA's reports client (src/pwa/reports.ts): the request it makes, which reports it sends in which request, how a refused
// one is kept from holding the others back, and the removals it keeps until the server has them. The server is a fake `fetch`;
// worker/ has its own tests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { testMagicKey } from "../support/magic-key";
import { HEADER } from "../../src/ai/protocol";
import { checkProof } from "../../src/ai/proof";
import { REPORT_LIMITS, type FlagReport, type ReportRequest } from "../../src/report/protocol";
import { createReports, reportsAreOn, withdrawLater } from "../../src/pwa/reports";
import { readFileSync } from "node:fs";
import { flagStateText } from "../../src/domain/flags";

const DEVICE = "d".repeat(22);
const report = (id: string): FlagReport => ({ id, flag: { id, note: "n" }, answer: null });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A client over a fake server: `respond` gets each request body and answers; `seen` collects what was asked. */
function client(key: string, respond: (body: ReportRequest) => Response | Promise<Response>) {
  const seen: { url: string; init: RequestInit; body: ReportRequest }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as ReportRequest;
    seen.push({ url, init, body });
    return respond(body);
  }) as unknown as typeof fetch;
  return { reports: createReports(key, doFetch, () => DEVICE), seen };
}
/** The server that keeps what it is sent and answers like the Worker. */
const storing = (body: ReportRequest) => json(200, { stored: (body.send ?? []).map((r) => r.id), withdrawn: body.withdraw ?? [] });

/** A localStorage that outlives a client, so that a later client can find what an earlier one kept. */
function stubStorage() {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
  return kept;
}
afterEach(() => vi.unstubAllGlobals());

describe("sending", () => {
  it("posts the reports with the device id and a proof the server can check, and never sends the key", async () => {
    const key = testMagicKey();
    const { reports, seen } = client(key, storing);
    expect(await reports.send([report("fl_a")])).toEqual(["fl_a"]);
    expect(seen).toHaveLength(1);
    const { url, init, body } = seen[0];
    expect(url).toBe("/api/flags");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers[HEADER.device]).toBe(DEVICE);
    expect(await checkProof(key, DEVICE, headers[HEADER.proof])).toBe(true);
    expect(JSON.stringify([headers, body])).not.toContain(key);
    expect(body.send).toEqual([report("fl_a")]);
  });

  it("sends at most as many reports in a request as the server takes, and gives back the ids it has", async () => {
    const { reports, seen } = client(testMagicKey(), storing);
    const ids = Array.from({ length: REPORT_LIMITS.send * 2 + 1 }, (_, i) => "fl_" + i);
    expect(await reports.send(ids.map(report))).toEqual(ids);
    expect(seen.map((s) => s.body.send?.length)).toEqual([REPORT_LIMITS.send, REPORT_LIMITS.send, 1]);
  });

  it("gives back only what the server has when it cannot be reached or refuses, and does not throw", async () => {
    let calls = 0;
    const { reports } = client(testMagicKey(), (body) => {
      if (++calls === 1) return storing(body);
      throw new TypeError("offline");
    });
    const ids = Array.from({ length: REPORT_LIMITS.send * 3 }, (_, i) => "fl_" + i);
    expect(await reports.send(ids.map(report))).toEqual(ids.slice(0, REPORT_LIMITS.send));
    expect(await client(testMagicKey(), () => json(403, { error: { code: "not_granted" } })).reports.send([report("fl_a")])).toEqual([]);
    expect(await client(testMagicKey(), () => json(429, { error: { code: "quota" } })).reports.send([report("fl_a")])).toEqual([]);
  });

  it("a request the server refuses as invalid is tried one report at a time, so one bad flag does not hold the others back", async () => {
    const { reports, seen } = client(testMagicKey(), (body) => ((body.send ?? []).some((r) => r.id === "fl_bad") ? json(400, { error: { code: "bad_request" } }) : storing(body)));
    expect(await reports.send(["fl_a", "fl_bad", "fl_b"].map(report))).toEqual(["fl_a", "fl_b"]);
    expect(seen.map((s) => s.body.send?.map((r) => r.id))).toEqual([["fl_a", "fl_bad", "fl_b"], ["fl_a"], ["fl_bad"], ["fl_b"]]);
  });
});

describe("automatic flags", () => {
  // a program's flags (Quorum's) are counted apart by the server, so they never share a request with the hand-made ones
  const auto = (id: string): FlagReport => ({ id, flag: { id, auto: "quorum", part: "quorum" }, answer: null });

  it("go in requests of their own, after the hand-made flags, whatever the order they were given in", async () => {
    const { reports, seen } = client(testMagicKey(), storing);
    const given = [auto("fa_1"), report("fl_a"), auto("fa_2"), report("fl_b")];
    expect(await reports.send(given)).toEqual(["fl_a", "fl_b", "fa_1", "fa_2"]);
    expect(seen.map((s) => s.body.send?.map((r) => r.id))).toEqual([["fl_a", "fl_b"], ["fa_1", "fa_2"]]);
  });

  it("a name that is not an automatic kind goes with the hand-made flags", async () => {
    const { reports, seen } = client(testMagicKey(), storing);
    const other: FlagReport = { id: "fa_x", flag: { id: "fa_x", auto: "somebody" }, answer: null };
    await reports.send([other, report("fl_a")]);
    expect(seen.map((s) => s.body.send?.map((r) => r.id))).toEqual([["fa_x", "fl_a"]]);
  });

  it("a full allowance of one kind does not stop the other from being tried", async () => {
    const { reports, seen } = client(testMagicKey(), (body) => ((body.send ?? []).some((r) => !r.flag.auto) ? json(429, { error: { code: "quota" } }) : storing(body)));
    expect(await reports.send([report("fl_a"), auto("fa_1")])).toEqual(["fa_1"]);
    expect(seen).toHaveLength(2);
    const autoFull = client(testMagicKey(), (body) => ((body.send ?? []).some((r) => r.flag.auto) ? json(429, { error: { code: "quota" } }) : storing(body)));
    expect(await autoFull.reports.send([auto("fa_1"), report("fl_a")])).toEqual(["fl_a"]);
  });

  it("are split into requests of the size the server takes, and a bad one is tried alone, as the others are", async () => {
    const { reports, seen } = client(testMagicKey(), (body) => ((body.send ?? []).some((r) => r.id === "fa_bad") ? json(400, { error: { code: "bad_request" } }) : storing(body)));
    const ids = Array.from({ length: REPORT_LIMITS.send + 1 }, (_, i) => "fa_" + i);
    expect(await reports.send(ids.map(auto))).toEqual(ids);
    expect(seen.map((s) => s.body.send?.length)).toEqual([REPORT_LIMITS.send, 1]);
    const bad = client(testMagicKey(), (body) => ((body.send ?? []).some((r) => r.id === "fa_bad") ? json(400, { error: { code: "bad_request" } }) : storing(body)));
    expect(await bad.reports.send(["fa_1", "fa_bad", "fa_2"].map(auto))).toEqual(["fa_1", "fa_2"]);
  });
});

describe("taking back", () => {
  it("tells the server at once", async () => {
    stubStorage();
    const { reports, seen } = client(testMagicKey(), storing);
    await reports.withdraw("fl_a");
    expect(seen.map((s) => s.body)).toEqual([{ withdraw: ["fl_a"] }]);
    await reports.flush();
    expect(seen).toHaveLength(1); // nothing left to say
  });

  it("keeps the id on the device while the server cannot be reached, and says it at the next flush, also from a later client", async () => {
    const kept = stubStorage();
    let up = false;
    const first = client(testMagicKey(), (body) => (up ? storing(body) : json(503, { error: { code: "unavailable" } })));
    await first.reports.withdraw("fl_a");
    await first.reports.withdraw("fl_b");
    expect(JSON.parse(kept.get("riglam.flagsToWithdraw")!)).toEqual(["fl_a", "fl_b"]);
    up = true;
    const later = client(testMagicKey(), storing);
    await later.reports.flush();
    expect(later.seen.map((s) => s.body)).toEqual([{ withdraw: ["fl_a", "fl_b"] }]);
    expect(kept.has("riglam.flagsToWithdraw")).toBe(false);
  });

  it("keeps the removals of the visit when storage refuses a write, so the next flush still has them", async () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: () => { throw new Error("the quota is full"); }, removeItem: (k: string) => void kept.delete(k) });
    let up = false;
    const { reports, seen } = client(testMagicKey(), (body) => (up ? storing(body) : json(503, { error: { code: "unavailable" } })));
    await reports.withdraw("fl_a");
    await reports.withdraw("fl_b");
    up = true;
    await reports.flush();
    expect(seen.at(-1)?.body).toEqual({ withdraw: ["fl_a", "fl_b"] });
  });

  it("a removal made while the device had no reports is kept, and the next client says it", async () => {
    const kept = stubStorage();
    withdrawLater("fl_a");
    withdrawLater("fl_a");
    expect(JSON.parse(kept.get("riglam.flagsToWithdraw")!)).toEqual(["fl_a"]);
    const { reports, seen } = client(testMagicKey(), storing);
    await reports.flush();
    expect(seen.map((s) => s.body)).toEqual([{ withdraw: ["fl_a"] }]);
    expect(kept.has("riglam.flagsToWithdraw")).toBe(false);
  });

  it("a flag made again after it was removed is not taken back by the earlier removal", async () => {
    const kept = stubStorage();
    kept.set("riglam.flagsToWithdraw", JSON.stringify(["fl_a", "fl_b"]));
    const { reports, seen } = client(testMagicKey(), storing);
    await reports.send([report("fl_a")]);
    expect(JSON.parse(kept.get("riglam.flagsToWithdraw")!)).toEqual(["fl_b"]);
    await reports.flush();
    expect(seen.map((s) => s.body)).toEqual([{ send: [report("fl_a")] }, { withdraw: ["fl_b"] }]);
  });
});

describe("whether the server takes reports", () => {
  const health = (body: unknown, status = 200) => (async () => json(status, body)) as unknown as typeof fetch;
  it("only when its health answer says so", async () => {
    expect(await reportsAreOn(health({ ok: true, tutor: "on", reports: "on" }))).toBe(true);
    expect(await reportsAreOn(health({ ok: true, tutor: "on", reports: "off" }))).toBe(false);
    expect(await reportsAreOn(health({ ok: true, tutor: "on" }))).toBe(false); // a server from before reports
    expect(await reportsAreOn(health({ ok: true, reports: "on" }, 500))).toBe(false);
    expect(await reportsAreOn((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toBe(false);
  });
});

describe("what the page shares with the server", () => {
  it("the page's limit for a stored answer is the server's", () => {
    const source = readFileSync(new URL("../../src/app/ai/flag-reports.js", import.meta.url), "utf8");
    expect(Number(/ANSWER_MAX=(\d+)\*1024/.exec(source)?.[1]) * 1024).toBe(REPORT_LIMITS.answer);
  });
  it("a flag's state in words, with the sent mark where flags are sent", () => {
    expect(flagStateText("new")).toBe("Not reviewed yet");
    expect(flagStateText("new", true)).toBe("Sent to the maintainer");
    expect(flagStateText("new", false)).toBe("Waiting to be sent");
    expect(flagStateText("reviewed", false)).toBe("Reviewed");
    expect(flagStateText("resolved", true)).toBe("Resolved");
  });
});
