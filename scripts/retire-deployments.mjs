// Retires the GitHub deployments of one environment: every deployment is marked inactive, then deleted. ci.yml creates them
// (the `environment:` of the preview job), and preview-cleanup.yml calls this when the pull request closes (docs/DEPLOY.md).
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo DEPLOY_ENVIRONMENT=preview/pr-14 node scripts/retire-deployments.mjs
//
// The workflow token with `deployments: write` is enough. Deleting the environment itself is an administration action that no
// workflow token can have, so a retired environment stays in the repository's settings, empty.
import { pathToFileURL } from "node:url";

// One authenticated call to the repository's REST API; fetchImpl is replaceable for the tests.
export function github({ token, repository, apiUrl = "https://api.github.com", fetchImpl = globalThis.fetch }) {
  return async function call(method, path, body) {
    const res = await fetchImpl(`${apiUrl}/repos/${repository}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "riglam-practice-ci",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : res.json();
  };
}

// A deployment can be deleted only when it is inactive (unless it is the repository's only one), hence the status first.
// Every deployment is tried even when one fails; the failures are returned.
export async function retire(call, environment) {
  const ids = [];
  for (let page = 1; ; page++) {
    const batch = await call("GET", `/deployments?environment=${encodeURIComponent(environment)}&per_page=100&page=${page}`);
    ids.push(...batch.map((d) => d.id));
    if (batch.length < 100) break;
  }
  const failures = [];
  for (const id of ids) {
    try {
      await call("POST", `/deployments/${id}/statuses`, { state: "inactive", description: "The pull request was closed" });
      await call("DELETE", `/deployments/${id}`);
    } catch (error) {
      failures.push(error.message);
    }
  }
  return { found: ids.length, failures };
}

const need = (env, name) => {
  if (!env[name]) throw new Error(`${name} is not set`);
  return env[name];
};

/**
 * @param {Record<string, string | undefined>} env GITHUB_TOKEN, GITHUB_REPOSITORY, DEPLOY_ENVIRONMENT, optionally GITHUB_API_URL
 * @param {{ fetchImpl?: typeof fetch, log?: (line: string) => void }} [options]
 */
export async function run(env, { fetchImpl, log = console.log } = {}) {
  const call = github({ token: need(env, "GITHUB_TOKEN"), repository: need(env, "GITHUB_REPOSITORY"), apiUrl: env.GITHUB_API_URL || undefined, fetchImpl });
  const environment = need(env, "DEPLOY_ENVIRONMENT");
  const { found, failures } = await retire(call, environment);
  log(`${environment}: ${found} deployment(s) found, ${found - failures.length} retired`);
  if (failures.length) throw new Error(`${failures.length} deployment(s) could not be retired:\n${failures.join("\n")}`);
  return { found };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.env).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
