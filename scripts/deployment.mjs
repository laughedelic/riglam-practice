// Records deployments on GitHub. The repository's Environments page and the "deployed to ..." lines on a pull request come
// from the deployments API, which the preview and production jobs call through this script (docs/DEPLOY.md).
//
//   node scripts/deployment.mjs start    creates a deployment of DEPLOY_ENVIRONMENT at DEPLOY_REF and marks it in progress;
//                                        its id goes to the step output `id`
//   node scripts/deployment.mjs finish   gives the deployment DEPLOYMENT_ID its final DEPLOY_STATE (success, failure or error)
//                                        and the address DEPLOY_URL
//   node scripts/deployment.mjs retire   marks every deployment of DEPLOY_ENVIRONMENT inactive, then deletes it
//
// The workflow token with `deployments: write` is enough. Deleting the environment itself is an administration action that no
// workflow token can have, so a retired environment stays in the repository's settings, empty.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const STATES = ["success", "failure", "error", "inactive"];
const DESCRIPTIONS = {
  in_progress: "Uploading the build",
  success: "Deployed",
  failure: "The upload failed, see the run",
  error: "The upload failed, see the run",
  inactive: "The pull request was closed",
};

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

// auto_merge and required_contexts matter: by default GitHub would merge the default branch into the ref, and would refuse
// the deployment while any check on the commit is still running (this runs inside the very workflow that is being checked).
export async function createDeployment(call, { environment, ref, description }) {
  const deployment = await call("POST", "/deployments", {
    ref,
    environment,
    description,
    task: "deploy",
    auto_merge: false,
    required_contexts: [],
  });
  if (!deployment?.id) throw new Error(`No deployment was created: ${JSON.stringify(deployment)}`);
  return deployment.id;
}

// auto_inactive (the default) marks the earlier successful deployments of the same environment inactive, so only the newest
// push of a pull request shows as live.
export async function setStatus(call, id, { state, url, logUrl, description = DESCRIPTIONS[state] }) {
  await call("POST", `/deployments/${id}/statuses`, {
    state,
    environment_url: url || undefined,
    log_url: logUrl || undefined,
    description,
    auto_inactive: true,
  });
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
      await setStatus(call, id, { state: "inactive" });
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
 * @param {string} command start, finish or retire
 * @param {Record<string, string | undefined>} env the settings, named as in the header
 * @param {{ fetchImpl?: typeof fetch, log?: (line: string) => void }} [options]
 */
export async function run(command, env, { fetchImpl, log = console.log } = {}) {
  const repository = need(env, "GITHUB_REPOSITORY");
  const call = github({ token: need(env, "GITHUB_TOKEN"), repository, apiUrl: env.GITHUB_API_URL || undefined, fetchImpl });
  const logUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;

  if (command === "start") {
    const id = await createDeployment(call, {
      environment: need(env, "DEPLOY_ENVIRONMENT"),
      ref: need(env, "DEPLOY_REF"),
      description: env.DEPLOY_DESCRIPTION || undefined,
    });
    await setStatus(call, id, { state: "in_progress", logUrl });
    log(`Deployment ${id} of ${env.DEPLOY_ENVIRONMENT} started`);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `id=${id}\n`);
    return { id };
  }

  if (command === "finish") {
    const state = need(env, "DEPLOY_STATE");
    if (!STATES.includes(state)) throw new Error(`DEPLOY_STATE must be one of ${STATES.join(", ")}, not ${state}`);
    const id = need(env, "DEPLOYMENT_ID");
    if (state === "success" && !env.DEPLOY_URL) log("::warning::The deployment has no address (none was found in the upload's output)");
    await setStatus(call, id, { state, url: env.DEPLOY_URL, logUrl });
    log(`Deployment ${id} is ${state}${env.DEPLOY_URL ? `: ${env.DEPLOY_URL}` : ""}`);
    return { id, state };
  }

  if (command === "retire") {
    const environment = need(env, "DEPLOY_ENVIRONMENT");
    const { found, failures } = await retire(call, environment);
    log(`${environment}: ${found} deployment(s) found, ${found - failures.length} retired`);
    if (failures.length) throw new Error(`${failures.length} deployment(s) could not be retired:\n${failures.join("\n")}`);
    return { found };
  }

  throw new Error(`Unknown command "${command}" (start, finish or retire)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2], process.env).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
