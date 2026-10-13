# Deploy

The installable app (`dist/pwa`) is static files. The default host is **Cloudflare Workers with static assets**, configured in `wrangler.jsonc`.

## Why this host

- Cloudflare now recommends Workers with static assets for new projects (Pages is not getting the new features). The static files, the service worker and the manifest do not care which one serves them, so the choice only affects the config file and the deploy command.
- The server (a Worker and a D1 database, [SERVER.md](SERVER.md)) lives in the same project as the static files, so the app did not have to move when it arrived.
- The free tier covers static requests (they are not billed on Workers assets).
- Per-branch preview addresses exist (`wrangler versions upload --preview-alias`), so a change can be tried on a phone by opening a link.

Alternatives considered and not chosen: GitHub Pages (no private-repo hosting on the free plan, no preview per pull request, no server later), Netlify and Vercel (fine for static files, but a second platform when a server arrives).

## What the pipeline does

| Event | Job | Result |
|---|---|---|
| Pull request | `ci.yml` → `deploy-preview` | uploads `dist/pwa` as a version with the alias `pr-<number>`; comments the address on the pull request |
| Push to `main` | `ci.yml` → `deploy-preview` | same, alias `staging` (follows main) |
| Release created (merge of the release pull request) | `release.yml` → `publish` | attaches `riglam-practice-pwa-<tag>.zip` to the GitHub release, then `wrangler deploy` puts the PWA on the production address |

Both deploy steps check for the two secrets below and skip with a notice when they are missing, so the pipeline works (build, tests, release) before any Cloudflare account exists.

## One-time setup (the repository owner)

1. A Cloudflare account (the free plan is enough).
2. Create the Worker once, from your own machine, signed in with `npx wrangler login` (browser sign-in, no token stored): `npm ci && npm run build:pwa && npx wrangler deploy`. This registers the name `riglam-practice` (the `name` in `wrangler.jsonc`), creates the `*.workers.dev` address and checks the account. Creating a Worker needs Admin rights on the account's Workers, which the token below deliberately does not have. If Cloudflare's API answers with a 504, run the command again; it is safe to repeat.
3. Create an **account-owned** API token for GitHub Actions: *Manage Account → Account API Tokens → Create Token → Create Custom Token* (not *My Profile → API Tokens*: per-Worker permissions need an account-owned token). Permission: product **Workers**, role **Editor**, resource: the single Worker `riglam-practice`. Nothing else, and not the "Edit Cloudflare Workers" template (it grants KV, R2, log tailing and zone routes, and the older "Workers Scripts" group it is built from is account-wide). Set an expiry (TTL) and a reminder to renew it. The exact labels in the token form may differ slightly from these; the rule is "Editor on this one Worker".
4. In GitHub: *Settings → Secrets and variables → Actions → New repository secret*: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (shown in the dashboard's right-hand sidebar; not sensitive). The data key `RIGLAM_DATA_KEY` is a secret too, see [DATA.md](DATA.md).
5. In the Cloudflare dashboard, under the Worker's *Settings → Domains & Routes*, make sure the workers.dev route and Preview URLs are enabled. Preview aliases (`pr-12-riglam-practice.<account>.workers.dev`) need them.
6. Optional: a custom domain on the Worker.

### What the token is used for

Only two workflow steps read it: `ci.yml` → `deploy-preview` (`wrangler versions upload`, on pull requests and on `main`) and `release.yml` → `publish` (`wrangler deploy`, when a release is created). Both upload the built files from `dist/pwa` and the Worker script bundled from `worker/` to the existing Worker. The token exists only as a GitHub repository secret.

Cloudflare's Workers authorization page lists "Editor on that Worker" as what `wrangler deploy` needs for an existing Worker, and "Admin at the Workers product scope" for creating one (hence step 2). With Editor on one Worker, a leaked token can change only that Worker; it cannot touch other Workers, KV, R2 or the account. Anyone who can push a branch to the repository can still run code with the token in the preview job (the token is given only to the two steps that need it, not to the dependency install). A preview is a version of the production Worker, so it also sees the production secrets and the D1 database, and a preview of a pull request that changes the Worker runs that code against them. With several writers, give previews their own Worker name and their own token, so a preview credential cannot replace production.

## The server's setup

The tutor needs a D1 database and two secrets on the Worker; without them it is off and the rest of the app works. The steps are in [SERVER.md](SERVER.md#setting-up-your-own).

## Public by link

The app is meant to be shared by link, with no sign-in. The workers.dev address and the preview addresses are reachable by anyone who has the link. Practice answers stay in the browser. The server keeps spend counters and a usage log keyed by a random device id for the tutor ([SERVER.md](SERVER.md)), and nothing else about a visitor.

The term data is a separate matter: the definitions are encrypted and open only with a key carried in the shared link, and the notes are not in the app at all. [DATA.md](DATA.md) has the details. All deterministic checks and static information work offline, so the data is in the client; only features that need an AI fetch from the server.

Search engines are asked to stay away: `X-Robots-Tag: noindex, nofollow, noarchive` for every file (`public/_headers`, which Cloudflare documents as applying to Workers static assets), `robots.txt` with `Disallow: /`, and a robots meta tag for crawlers that fetch anyway.

Neither the CI nor the release workflow uploads the artifact build, because it holds the definitions in the clear.

## What the checks cover

`wrangler deploy --dry-run` runs in CI against `dist/pwa` and `worker/`, bundles the script and accepts the config. The PWA build is served by `vite preview` in the browser tests, including offline start from the service worker cache. The unit tests check the build for plaintext definitions, the key and the noindex files.

`wrangler.jsonc` pins `workers_dev` and `preview_urls` to `true`. Without them wrangler enables both on every deploy and says so, which would undo a switch-off made in the dashboard. To turn either address off, change it in the file, not only in the dashboard.

## Base path

The PWA is built with relative asset URLs (`base: "./"`), so it works at a domain root and under a sub-path (for instance a GitHub Pages project site) without a rebuild. Set `BASE_PATH` only if an absolute base is wanted.

## Moving to another static host

`dist/pwa` is the whole site: upload it anywhere that serves static files over HTTPS (the service worker needs HTTPS or localhost). The only host-specific file is `wrangler.jsonc`.
