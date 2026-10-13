# Deploy

The installable app (`dist/pwa`) is static files. The default host is **Cloudflare Workers with static assets**, configured in `wrangler.jsonc`.

## Why this host

- Cloudflare now recommends Workers with static assets for new projects (Pages is not getting the new features). The static files, the service worker and the manifest do not care which one serves them, so the choice only affects the config file and the deploy command.
- A server (a Worker and a D1 database) can be added to the same project later without moving the app.
- The free tier covers static requests (they are not billed on Workers assets).
- Per-branch preview addresses exist (`wrangler versions upload --preview-alias`), so a change can be tried on a phone by opening a link.

Alternatives considered and not chosen: GitHub Pages (no private-repo hosting on the free plan, no preview per pull request, no server later), Netlify and Vercel (fine for static files, but a second platform when a server arrives).

## What the pipeline does

| Event | Job | Result |
|---|---|---|
| Pull request | `ci.yml` → `deploy-preview` | uploads `dist/pwa` as a version with the alias `pr-<number>`; GitHub lists the job as a deployment of the environment `preview/pr-<number>`, with the address as its URL |
| Pull request closed or merged | `preview-cleanup.yml` | marks the deployments of `preview/pr-<number>` inactive, then deletes that environment when the secret `GH_ENVIRONMENTS_API` is set |
| Push to `main` | `ci.yml` → `deploy-preview` | same upload, alias `staging` (follows main), recorded in the environment `staging` |
| Release created (merge of the release pull request) | `release.yml` → `publish` | attaches `riglam-practice-pwa-<tag>.zip` to the GitHub release, then `wrangler deploy` puts the PWA on the production address (a deployment of the environment `production`) |

Both deploy steps check for the two secrets below and skip with a notice when they are missing, so the pipeline works (build, tests, release) before any Cloudflare account exists.

## Deployments on GitHub

The preview job and the release job declare an `environment:` (name and URL), so GitHub records each run as a deployment: a pull request gets a "deployed to `preview/pr-<number>`" entry with a link to the preview, and the repository's deployments list has `production`, `staging` and the previews. Each pull request has an environment of its own because GitHub marks the earlier deployment of an environment inactive when a new one succeeds; with one shared `preview` environment, each new preview would make the others look dead while they still serve. The URL is the address that `wrangler` printed. If the upload fails, the deployment is marked failed. Without the Cloudflare secrets the job skips the upload but still counts as a deployment, with no URL.

When a pull request is closed or merged, `preview-cleanup.yml` marks the deployments of that pull request's environment inactive, with two `gh api` calls and the workflow's own `GITHUB_TOKEN` (`deployments: write`). It runs on `pull_request_target`, so it works from the base branch and starts even when the pull request is closed right after a push; it can also be started by hand with a pull request number. The deployments are kept, so the pull request still shows what was deployed, including failed attempts; they just no longer count as live. The pull request's timeline keeps its "deployed to" entries even after the environment is gone.

The environment `preview/pr-<number>` would otherwise stay under *Settings → Environments* and pile up. Deleting an environment is a repository administration action, and the workflow token has no such permission (the `permissions:` key has no administration scope), so a last step, `DELETE /repos/{owner}/{repo}/environments/{name}` with the name URL-encoded (`preview%2Fpr-14`), uses the repository secret `GH_ENVIRONMENTS_API`: a fine-grained personal access token limited to this repository, with the *Administration* repository permission (read and write). Without that secret the step prints a notice and the environments stay.

The Cloudflare alias `pr-<number>` is not removed when the pull request closes, and Cloudflare documents no way to delete one. Cloudflare keeps only the [1000 most recently deployed aliases](https://developers.cloudflare.com/workers/configuration/previews/) and deletes the least recently deployed one when a new alias goes past that limit, so an old pull request's address stops working only then. Cloudflare's own advice for branch and pull request previews is its separate [Previews](https://developers.cloudflare.com/workers/previews/compare-workflows/) feature (`wrangler preview`), which isolates resources per branch; this repository still uses aliased version URLs.

A preview opens with the definitions locked. Add the study group's key to the address (`#k=<key>`, see [DATA.md](DATA.md)) to unlock them; the key is never part of a deployment.

## One-time setup (the repository owner)

1. A Cloudflare account (the free plan is enough).
2. Create the Worker once, from your own machine, signed in with `npx wrangler login` (browser sign-in, no token stored): `npm ci && npm run build:pwa && npx wrangler deploy`. This registers the name `riglam-practice` (the `name` in `wrangler.jsonc`), creates the `*.workers.dev` address and checks the account. Creating a Worker needs Admin rights on the account's Workers, which the token below deliberately does not have. If Cloudflare's API answers with a 504, run the command again; it is safe to repeat.
3. Create an **account-owned** API token for GitHub Actions: *Manage Account → Account API Tokens → Create Token → Create Custom Token* (not *My Profile → API Tokens*: per-Worker permissions need an account-owned token). Permission: product **Workers**, role **Editor**, resource: the single Worker `riglam-practice`. Nothing else, and not the "Edit Cloudflare Workers" template (it grants KV, R2, log tailing and zone routes, and the older "Workers Scripts" group it is built from is account-wide). Set an expiry (TTL) and a reminder to renew it. The exact labels in the token form may differ slightly from these; the rule is "Editor on this one Worker".
4. In GitHub: *Settings → Secrets and variables → Actions → New repository secret*: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (shown in the dashboard's right-hand sidebar; not sensitive). The data key `RIGLAM_DATA_KEY` is a secret too, see [DATA.md](DATA.md).
5. In the Cloudflare dashboard, under the Worker's *Settings → Domains & Routes*, make sure the workers.dev route and Preview URLs are enabled. Preview aliases (`pr-12-riglam-practice.<account>.workers.dev`) need them.
6. Optional: a custom domain on the Worker.

### What the token is used for

Only two workflow steps read it: `ci.yml` → `deploy-preview` (`wrangler versions upload`, on pull requests and on `main`) and `release.yml` → `publish` (`wrangler deploy`, when a release is created). Both upload the built files from `dist/pwa` to the existing Worker. The token exists only as a GitHub repository secret.

Cloudflare's Workers authorization page lists "Editor on that Worker" as what `wrangler deploy` needs for an existing Worker, and "Admin at the Workers product scope" for creating one (hence step 2). With Editor on one Worker, a leaked token can change only that Worker; it cannot touch other Workers, KV, R2 or the account. Anyone who can push a branch to the repository can still run code with the token in the preview job. With several writers, give previews their own Worker name and their own token, so a preview credential cannot replace production.

## Public by link

The app is meant to be shared by link, with no sign-in. The workers.dev address and the preview addresses are reachable by anyone who has the link. Practice answers stay in the browser; the server stores nothing about a visitor.

The term data is a separate matter: the definitions are encrypted and open only with a key carried in the shared link, and the notes are not in the app at all. [DATA.md](DATA.md) has the details. All deterministic checks and static information work offline, so the data is in the client; only features that need an AI would fetch from a server.

Search engines are asked to stay away: `X-Robots-Tag: noindex, nofollow, noarchive` for every file (`public/_headers`, which Cloudflare documents as applying to Workers static assets), `robots.txt` with `Disallow: /`, and a robots meta tag for crawlers that fetch anyway.

Neither the CI nor the release workflow uploads the artifact build, because it holds the definitions in the clear.

## What the checks cover

`wrangler deploy --dry-run` runs in CI against `dist/pwa` and accepts the config. The PWA build is served by `vite preview` in the browser tests, including offline start from the service worker cache. The unit tests check the build for plaintext definitions, the key and the noindex files.

`wrangler.jsonc` pins `workers_dev` and `preview_urls` to `true`. Without them wrangler enables both on every deploy and says so, which would undo a switch-off made in the dashboard. To turn either address off, change it in the file, not only in the dashboard.

## Base path

The PWA is built with relative asset URLs (`base: "./"`), so it works at a domain root and under a sub-path (for instance a GitHub Pages project site) without a rebuild. Set `BASE_PATH` only if an absolute base is wanted.

## Moving to another static host

`dist/pwa` is the whole site: upload it anywhere that serves static files over HTTPS (the service worker needs HTTPS or localhost). The only host-specific file is `wrangler.jsonc`.
