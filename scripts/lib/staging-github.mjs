// The few GitHub REST calls the staging rebuild makes (docs/STAGING.md): list the open pull requests, read and write the `staging` check run on
// a commit, and take a label off a closed pull request. Plain `fetch`, no dependencies; `fetchImpl` is for tests. Only a GitHub App can write
// a check run, so the token has to be the workflow's own (`github.token`), not a personal one.
import { StagingError } from "./staging.mjs";

/**
 * @param {{ repo: string, token: string, apiUrl?: string, fetchImpl?: typeof fetch }} options  `repo` is "owner/name"
 */
export function githubClient({ repo, token, apiUrl = process.env.GITHUB_API_URL || "https://api.github.com", fetchImpl = globalThis.fetch }) {
  async function request(method, path, body) {
    const res = await fetchImpl(`${apiUrl}/repos/${repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new StagingError(`GitHub ${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  }

  async function all(path) {
    const out = [];
    for (let page = 1; ; page++) {
      const batch = await request("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      out.push(...batch);
      if (batch.length < 100) return out;
    }
  }

  return {
    /** Every open pull request, with its labels. */
    openPulls: () => all("/pulls?state=open"),
    /** The latest check run of this name that the workflow's own app made on a commit, or null when it made none. */
    async currentCheck(sha, name) {
      const runs = (await request("GET", `/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&per_page=100`)).check_runs ?? [];
      const mine = runs.filter((r) => r.app?.slug === "github-actions").sort((a, b) => b.id - a.id)[0];
      return mine ? { conclusion: mine.conclusion, title: mine.output?.title ?? "", summary: mine.output?.summary ?? "" } : null;
    },
    /** Makes a finished check run on a commit. @param {string} sha @param {{ name: string, conclusion: string, title: string, summary: string, detailsUrl?: string }} check */
    async setCheck(sha, { name, conclusion, title, summary, detailsUrl }) {
      await request("POST", "/check-runs", { name, head_sha: sha, status: "completed", conclusion, output: { title, summary }, ...(detailsUrl ? { details_url: detailsUrl } : {}) });
    },
    /** The numbers of the closed (or merged) pull requests that still have a label. */
    closedLabeled: async (label) => (await all(`/issues?state=closed&labels=${encodeURIComponent(label)}`)).filter((i) => i.pull_request).map((i) => i.number),
    /** Takes a label off a pull request; one that does not have it is fine. */
    async removeLabel(number, label) {
      try {
        await request("DELETE", `/issues/${number}/labels/${encodeURIComponent(label)}`);
      } catch (e) {
        if (!/answered 404/.test(e.message)) throw e;
      }
    },
  };
}
