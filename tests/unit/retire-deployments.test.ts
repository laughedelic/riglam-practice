// The script that retires a closed pull request's deployments (scripts/retire-deployments.mjs): which requests it sends, in
// which order, and what it does when one fails. The API is a recorded fake; nothing here reaches GitHub.
import { expect, test } from "vitest";
import { run } from "../../scripts/retire-deployments.mjs";

type Sent = { method: string; url: string; body: any };

// Answers like GitHub: a list gives the ids set up for the environment, a status or a delete succeeds.
function fakeGitHub({ listed = [] as number[][], failOn = (_s: Sent): boolean => false } = {}) {
  const sent: Sent[] = [];
  const pages = [...listed];
  const fetchImpl = (async (url: string, init: any) => {
    const entry: Sent = { method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined };
    sent.push(entry);
    if (failOn(entry)) return new Response('{"message":"nope"}', { status: 422 });
    if (entry.method === "POST") return Response.json({ id: 1 }, { status: 201 });
    if (entry.method === "GET") return Response.json((pages.shift() ?? []).map((id) => ({ id })));
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

const env = { GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "owner/repo", DEPLOY_ENVIRONMENT: "preview/pr-14" };
const quiet = () => {};
const short = (s: Sent) => `${s.method} ${s.url.replace("https://api.github.com/repos/owner/repo", "")}`;

test("it asks for the environment by its encoded name and marks each deployment inactive, deleting none", async () => {
  const github = fakeGitHub({ listed: [[11, 12]] });
  expect(await run(env, { fetchImpl: github.fetchImpl, log: quiet })).toEqual({ found: 2 });
  expect(github.sent.map(short)).toEqual([
    "GET /deployments?environment=preview%2Fpr-14&per_page=100&page=1",
    "POST /deployments/11/statuses",
    "POST /deployments/12/statuses",
  ]);
  expect(github.sent[1].body.state).toBe("inactive");
  expect(github.sent[0]).toMatchObject({ url: expect.stringContaining("https://api.github.com/repos/owner/repo/") });
});

test("it does nothing for an environment without deployments", async () => {
  const github = fakeGitHub();
  expect(await run(env, { fetchImpl: github.fetchImpl, log: quiet })).toEqual({ found: 0 });
  expect(github.sent).toHaveLength(1);
});

test("it reads every page of the list and marks every deployment", async () => {
  const first = Array.from({ length: 100 }, (_, i) => i + 1);
  const github = fakeGitHub({ listed: [first, [101]] });
  expect(await run(env, { fetchImpl: github.fetchImpl, log: quiet })).toEqual({ found: 101 });
  expect(github.sent.filter((s) => s.method === "GET").map((s) => s.url.match(/&page=(\d+)/)![1])).toEqual(["1", "2"]);
  expect(github.sent.filter((s) => s.method === "POST")).toHaveLength(101);
});

test("it carries on after a deployment that cannot be marked, then fails and names it", async () => {
  const github = fakeGitHub({ listed: [[11, 12]], failOn: (s) => s.method === "POST" && s.url.endsWith("/deployments/11/statuses") });
  await expect(run(env, { fetchImpl: github.fetchImpl, log: quiet })).rejects.toThrow(/1 deployment\(s\) could not be retired[\s\S]*deployments\/11/);
  expect(github.sent.some((s) => s.method === "POST" && s.url.endsWith("/deployments/12/statuses"))).toBe(true);
});

test("a missing setting is named", async () => {
  await expect(run({ ...env, DEPLOY_ENVIRONMENT: undefined }, { fetchImpl: fakeGitHub().fetchImpl, log: quiet })).rejects.toThrow(/DEPLOY_ENVIRONMENT is not set/);
});
