# Deploy

The installable app (`dist/pwa`) is static files. The default host is **Cloudflare Workers with static assets**, configured in `wrangler.jsonc`.

## Why this host

- Cloudflare now recommends Workers with static assets for new projects (Pages is not getting the new features). The static files, the service worker and the manifest do not care which one serves them, so the choice only affects the config file and the deploy command.
- The server (a Worker and a D1 database, [SERVER.md](SERVER.md)) lives in the same project as the static files, so the app did not have to move when it arrived.
- The free tier covers static requests (they are not billed on Workers assets).
- Per-branch preview addresses exist (Cloudflare Worker Previews), so a change can be tried on a phone by opening a link.

Alternatives considered and not chosen: GitHub Pages (no private-repo hosting on the free plan, no preview per pull request, no server later), Netlify and Vercel (fine for static files, but a second platform when a server arrives).

## What the pipeline does

| Event | Job | Result |
|---|---|---|
| Push to a branch, pull request | Cloudflare Workers Builds (not GitHub Actions) | builds the branch and publishes it as a Worker Preview with its own address, shown by Cloudflare as a comment and a check on the pull request |
| Release created (merge of the release pull request) | `release.yml` → `publish` | attaches `riglam-practice-pwa-<tag>.zip` to the GitHub release |
| Push to `main` that changes `.release-please-manifest.json` (the merge of the release pull request) | Cloudflare Workers Builds, not GitHub | builds the PWA and runs `wrangler deploy`: this is the production deploy |

No GitHub workflow deploys anything or holds a Cloudflare credential.

### Production deploy

Production is deployed by a Cloudflare Workers Builds trigger connected to the repository (*Workers & Pages → the Worker → Settings → Build*): branch `main`, build command `npm run build:pwa`, deploy command `npx wrangler deploy`, and the path filter `.release-please-manifest.json` under *Build watch paths*. Ordinary merges to `main` do not change that file, so they do not deploy; the release pull request does, so a release is the only thing that reaches production. The secrets the Worker needs are set on the Worker itself (see [SERVER.md](SERVER.md)); a secret changed in the dashboard makes a new version that is not live until it is deployed, and it is built on the latest uploaded version, which may be a branch build, so set secrets with `npx wrangler secret put`.

### Previews of branches

A Worker Preview does not inherit the production Worker's variables, bindings or secrets. What a Preview has is the `previews` block of `wrangler.jsonc` on the branch that is built: the tutor settings with lower budgets, persisted logs, the check lab turned on (`LAB`, with budgets of its own; [SERVER.md](SERVER.md), "The check lab") and the D1 database `riglam-practice-staging`, which every Preview and the `staging` Preview share (so they share budget counters and accounts, and a pull request never touches production data). Secrets are not in the file: `ANTHROPIC_API_KEY` and `RIGLAM_DATA_KEY` are set once in the Preview base configuration (*Settings → Build* in the dashboard, or `npx wrangler preview base-config secret put <NAME>`) and copied into each Preview when it is created, so a change to the base reaches new Previews only. Saving a secret on a Preview makes a new deployment of it: the per-commit address that Cloudflare lists in the pull request comment keeps the secrets it was made with, while the branch address (`<branch>-riglam-practice.<account>.workers.dev`) always follows the latest deployment, so use that one. The course data for the tutor is loaded into the shared database with `npm run data:publish -- --config wrangler.staging-migrations.jsonc`.

In the Workers Builds settings: *Branch control → Enable Preview Builds*, build command `npm run build:pwa` and the preview command `npx wrangler preview` (Cloudflare's default). Wrangler names the Preview after the branch. Nothing applies migrations to the shared database for a branch: one that a pull request adds is applied by hand ([STAGING.md](STAGING.md)). `npm run staging -- deploy --here` as the preview command does the same for other branches, and for `staging` it also applies the migrations and names the app "Riglam practice (staging)" ([STAGING.md](STAGING.md)).

## One-time setup (the repository owner)

1. A Cloudflare account (the free plan is enough).
2. Create the Worker once, from your own machine, signed in with `npx wrangler login` (browser sign-in, no token stored): `npm ci && npm run build:pwa && npx wrangler deploy`. This registers the name `riglam-practice` (the `name` in `wrangler.jsonc`), creates the `*.workers.dev` address and checks the account. Creating a Worker needs Admin rights on the account's Workers. If Cloudflare's API answers with a 504, run the command again; it is safe to repeat.
3. Connect the repository to the Worker for builds (*Settings → Build*, as under Production deploy above). The data key `RIGLAM_DATA_KEY` is a Worker secret: see [DATA.md](DATA.md).
4. In the Cloudflare dashboard, under the Worker's *Settings → Domains & Routes*, make sure the workers.dev route and Preview URLs are enabled. Preview aliases (`pr-12-riglam-practice.<account>.workers.dev`) need them.
5. Optional: a custom domain on the Worker.

## Staging

The open pull requests are merged into the `staging` branch and deployed as the Worker Preview `staging`, with its own database, secrets and budgets: [STAGING.md](STAGING.md).

## The server's setup

The tutor needs a D1 database and two secrets on the Worker; without them it is off and the rest of the app works. The steps are in [SERVER.md](SERVER.md#setting-up-your-own).

## Public by link

The app is meant to be shared by link, with no sign-in. The workers.dev address and the preview addresses are reachable by anyone who has the link. Practice answers stay in the browser. The server keeps spend counters and a usage log keyed by a random device id for the tutor ([SERVER.md](SERVER.md)), and nothing else about a visitor.

The term data is a separate matter: the definitions are kept on the server and given only to a request that proves the Magic Key (carried in the shared link), and the notes are not in the app at all. [DATA.md](DATA.md) has the details. All deterministic checks and static information work offline, so the data is in the client; only features that need an AI fetch from the server.

Search engines are asked to stay away: `X-Robots-Tag: noindex, nofollow, noarchive` for every file (`public/_headers`, which Cloudflare documents as applying to Workers static assets), `robots.txt` with `Disallow: /`, and a robots meta tag for crawlers that fetch anyway.

Neither the CI nor the release workflow uploads the artifact build, because it holds the definitions in the clear.

## What the checks cover

`wrangler deploy --dry-run` runs in CI against `dist/pwa` and `worker/`, bundles the script and accepts the config. The PWA build is served by `vite preview` in the browser tests, including offline start from the service worker cache. The unit tests check the build for plaintext definitions, the key and the noindex files.

`wrangler.jsonc` pins `workers_dev` and `preview_urls` to `true`. Without them wrangler enables both on every deploy and says so, which would undo a switch-off made in the dashboard. To turn either address off, change it in the file, not only in the dashboard.

## Base path

The PWA is built with relative asset URLs (`base: "./"`), so it works at a domain root and under a sub-path (for instance a GitHub Pages project site) without a rebuild. Set `BASE_PATH` only if an absolute base is wanted.

## Moving to another static host

`dist/pwa` is the whole site: upload it anywhere that serves static files over HTTPS (the service worker needs HTTPS or localhost). The only host-specific file is `wrangler.jsonc`.
