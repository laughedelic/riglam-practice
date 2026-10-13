// The script behind the deployments shown on GitHub (scripts/deployment.mjs): which requests it sends, in which order, and what
// it does when one fails. The API is a recorded fake; nothing here reaches GitHub.
import { expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../scripts/deployment.mjs";

type Sent = { method: string; url: string; body: any };

// Answers like GitHub: creating a deployment gives it the next id, a list gives the ids set up for the environment.
function fakeGitHub({ listed = [] as number[][], failOn = (_s: Sent): boolean => false } = {}) {
  const sent: Sent[] = [];
  const pages = [...listed];
  const fetchImpl = (async (url: string, init: any) => {
    const entry: Sent = { method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined };
    sent.push(entry);
    if (failOn(entry)) return new Response('{"message":"nope"}', { status: 422 });
    if (entry.method === "POST" && entry.url.endsWith("/deployments")) return Response.json({ id: 77 }, { status: 201 });
    if (entry.method === "POST") return Response.json({ id: 1 }, { status: 201 });
    if (entry.method === "GET") return Response.json((pages.shift() ?? []).map((id) => ({ id })));
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

const env = {
  GITHUB_TOKEN: "t",
  GITHUB_REPOSITORY: "owner/repo",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_RUN_ID: "42",
};
const quiet = () => {};

test("start creates the deployment without merging or waiting for checks, then marks it in progress and hands over the id", async () => {
  const github = fakeGitHub();
  const dir = mkdtempSync(join(tmpdir(), "deployment-"));
  const output = join(dir, "output");
  const result = await run(
    "start",
    { ...env, DEPLOY_ENVIRONMENT: "preview/pr-14", DEPLOY_REF: "abc1234", DEPLOY_DESCRIPTION: "Pull request 14", GITHUB_OUTPUT: output },
    { fetchImpl: github.fetchImpl, log: quiet },
  );
  expect(result).toEqual({ id: 77 });
  expect(readFileSync(output, "utf8")).toBe("id=77\n");
  expect(github.sent.map((s) => `${s.method} ${s.url}`)).toEqual([
    "POST https://api.github.com/repos/owner/repo/deployments",
    "POST https://api.github.com/repos/owner/repo/deployments/77/statuses",
  ]);
  expect(github.sent[0].body).toMatchObject({ ref: "abc1234", environment: "preview/pr-14", auto_merge: false, required_contexts: [] });
  expect(github.sent[1].body).toMatchObject({ state: "in_progress", log_url: "https://github.com/owner/repo/actions/runs/42" });
});

test("finish sets the state with the address of the deployment", async () => {
  const github = fakeGitHub();
  await run("finish", { ...env, DEPLOYMENT_ID: "77", DEPLOY_STATE: "success", DEPLOY_URL: "https://pr-14-riglam-practice.example.workers.dev" }, { fetchImpl: github.fetchImpl, log: quiet });
  expect(github.sent).toHaveLength(1);
  expect(github.sent[0].url).toBe("https://api.github.com/repos/owner/repo/deployments/77/statuses");
  expect(github.sent[0].body).toMatchObject({ state: "success", environment_url: "https://pr-14-riglam-practice.example.workers.dev", auto_inactive: true });
});

test("finish without an address says so but still records the state, and refuses a state GitHub does not know", async () => {
  const github = fakeGitHub();
  const lines: string[] = [];
  await run("finish", { ...env, DEPLOYMENT_ID: "77", DEPLOY_STATE: "success" }, { fetchImpl: github.fetchImpl, log: (l: string) => lines.push(l) });
  expect(lines.join("\n")).toMatch(/::warning::/);
  expect(github.sent[0].body.environment_url).toBeUndefined();
  await expect(run("finish", { ...env, DEPLOYMENT_ID: "77", DEPLOY_STATE: "done" }, { fetchImpl: github.fetchImpl, log: quiet })).rejects.toThrow(/DEPLOY_STATE/);
});

test("retire asks for the environment by its encoded name, marks each deployment inactive and only then deletes it", async () => {
  const github = fakeGitHub({ listed: [[11, 12]] });
  const result = await run("retire", { ...env, DEPLOY_ENVIRONMENT: "preview/pr-14" }, { fetchImpl: github.fetchImpl, log: quiet });
  expect(result).toEqual({ found: 2 });
  expect(github.sent.map((s) => `${s.method} ${s.url.replace("https://api.github.com/repos/owner/repo", "")}`)).toEqual([
    "GET /deployments?environment=preview%2Fpr-14&per_page=100&page=1",
    "POST /deployments/11/statuses",
    "DELETE /deployments/11",
    "POST /deployments/12/statuses",
    "DELETE /deployments/12",
  ]);
  expect(github.sent[1].body.state).toBe("inactive");
});

test("retire reads every page of the list before it deletes anything", async () => {
  const first = Array.from({ length: 100 }, (_, i) => i + 1);
  const github = fakeGitHub({ listed: [first, [101]] });
  const result = await run("retire", { ...env, DEPLOY_ENVIRONMENT: "preview/pr-14" }, { fetchImpl: github.fetchImpl, log: quiet });
  expect(result).toEqual({ found: 101 });
  const gets = github.sent.filter((s) => s.method === "GET");
  expect(gets.map((s) => s.url.match(/&page=(\d+)/)![1])).toEqual(["1", "2"]);
  expect(github.sent.findIndex((s) => s.method !== "GET")).toBe(2);
  expect(github.sent.filter((s) => s.method === "DELETE")).toHaveLength(101);
});

test("retire carries on after a deployment that cannot be removed, then fails and names it", async () => {
  const github = fakeGitHub({ listed: [[11, 12]], failOn: (s) => s.method === "DELETE" && s.url.endsWith("/deployments/11") });
  await expect(run("retire", { ...env, DEPLOY_ENVIRONMENT: "preview/pr-14" }, { fetchImpl: github.fetchImpl, log: quiet })).rejects.toThrow(/1 deployment\(s\) could not be retired[\s\S]*deployments\/11/);
  expect(github.sent.some((s) => s.method === "DELETE" && s.url.endsWith("/deployments/12"))).toBe(true);
});

test("a failed request stops start, and a missing setting or command is named", async () => {
  const github = fakeGitHub({ failOn: (s) => s.method === "POST" });
  await expect(run("start", { ...env, DEPLOY_ENVIRONMENT: "staging", DEPLOY_REF: "abc" }, { fetchImpl: github.fetchImpl, log: quiet })).rejects.toThrow(/answered 422/);
  await expect(run("start", { ...env, DEPLOY_REF: "abc" }, { fetchImpl: github.fetchImpl, log: quiet })).rejects.toThrow(/DEPLOY_ENVIRONMENT is not set/);
  await expect(run("deploy", env, { fetchImpl: github.fetchImpl, log: quiet })).rejects.toThrow(/Unknown command/);
});
