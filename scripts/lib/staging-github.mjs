// The few GitHub REST calls the staging rebuild makes (docs/STAGING.md): list the open pull requests, set a commit status, read and write
// pull request comments. Plain `fetch`, no dependencies; `fetchImpl` is for tests.
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
    /** @param {string} sha @param {{ state: string, description: string, context: string, targetUrl?: string }} status */
    async setStatus(sha, { state, description, targetUrl, context }) {
      await request("POST", `/statuses/${sha}`, { state, description, context, ...(targetUrl ? { target_url: targetUrl } : {}) });
    },
    /** The latest status of `context` on a commit, or null when it has none. */
    async currentStatus(sha, context) {
      const status = (await request("GET", `/commits/${sha}/status?per_page=100`)).statuses?.find((s) => s.context === context);
      return status ? { state: status.state, description: status.description ?? "" } : null;
    },
    /** The texts of a pull request's comments. */
    comments: async (number) => (await all(`/issues/${number}/comments`)).map((c) => c.body ?? ""),
    async comment(number, body) {
      await request("POST", `/issues/${number}/comments`, { body });
    },
  };
}
