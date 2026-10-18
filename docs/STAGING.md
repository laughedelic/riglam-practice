# Staging

Pull requests are reviewed and tested one at a time, and some of them wait on others. The `staging` branch shows them together: it is `main` with the pull requests labeled `staging` merged in, and it is deployed as a Worker Preview of its own, so a change can be tried in the running app, next to the others, before anyone merges it. A workflow keeps it up to date; nobody maintains a list.

## Putting a pull request on staging

Add the label `staging` to the pull request (a draft is fine). Take the label off, or close or merge the pull request, and it leaves staging at the next rebuild; the workflow takes the label off a pull request that was merged or closed, so it does not stay behind (label a reopened one again). That is all there is to do.

- **Stacks come along.** A labeled pull request brings the open pull requests it is stacked on (the ones whose branches are the bases of others, down to `main`), because the top of a stack cannot be tried without what is under it. Label the top one and the whole stack is in. The check of a pulled-in pull request says so.
- **Order.** Each rebuild merges in this order: a pull request after the one it is stacked on, and otherwise by pull request number. The number never changes, so the same pull requests always merge the same way, and a stack stays together.
- **Rebuilt from `main` every time.** Nothing is kept from the last build, so there is no list to go stale and no resolved conflict to carry along. The branch is generated and force-pushed. Nobody commits to it, nobody opens a pull request from it or into it, and it is never merged. A fix belongs in the pull request's own branch; the next rebuild picks it up.
- **Not on staging:** a pull request whose branch is in a fork, and the release pull request (`chore(main): release ...`) unless it is labeled. A pull request that is not meant to land should not carry the label.
- Pull requests should be stacked only when one really depends on another. Independent changes each start from `main`; staging is where they meet.

## When it rebuilds

The workflow [staging.yml](../.github/workflows/staging.yml) runs

- when a pull request is labeled, unlabeled, pushed to, retargeted, reopened or closed,
- when `main` changes (a merge), and
- every 30 minutes, as a net under the events. A pull request stacked on a branch that does not have the workflow file yet, one that conflicts with `main`, and a push made by a workflow's own token do not start a `pull_request` workflow; the schedule catches them.

Every run reads the open pull requests afresh, so a run that was queued behind another needs nothing from the event that started it. A run that finds `origin/staging` already built from the same `main`, the same pull request heads and the same stacking (they are recorded in `staging.json`) builds and pushes nothing; it only makes good a check or a comment that GitHub refused after the last push. Otherwise it pushes the new branch, which starts the deploy (below), and then runs lint, types, a build and the unit tests on the result in a second job, because that is where two pull requests can break each other.

## When a pull request does not merge

The rebuild leaves that pull request out, and every pull request stacked on it, and builds the rest. Nothing stops at the first conflict.

- The pull request gets a check run named `staging` in red, with the files in conflict, who else changed them (`main` since the branch left it, or a pull request that is on staging before it) and what to do. A failed check run reaches whoever follows the pull request, a person or an agent watching it, like a failed CI job.
- A check is made only when it differs from the one the commit has: a pull request that stays out for the same reason is not told again at every rebuild, and one whose conflict changes (another file, another pull request) is. When the branch merges cleanly the check is made again, green. A pull request that leaves staging, by losing its label or being closed, gets a neutral "Not in staging" in place of the old one.
- When it stops merging, it also gets one comment saying the same, which tells the author where to look from then on. The comment is posted once per conflict (a run that finds it missing posts it again).
- The run fails the first time a pull request is left out, so that it is seen, and passes while the same pull requests stay out.
- The fix is the one for any pull request: merge `main` (or the pull request it conflicts with) into its branch and push. Staging rebuilds on its own and the check turns green. Never resolve a conflict on `staging`.

After a pull request that others are stacked on is squash-merged, its children conflict with the squashed commit until `main` is merged into them; they also drop out of the rebuild until then, and come back when it is.

`staging.json` on the branch records what went in (`pulls`), what was left out and why (`skipped`) and the inputs of the build. `npm run staging -- list` prints it, and `/staging-build.json` on the deployed address shows what is running.

## Running it by hand

The workflow runs `node scripts/staging.mjs sync --push --report`. The same script works on a clone:

```sh
npm run staging                                # build the local staging branch from main and the labeled pull requests (the list comes from GITHUB_TOKEN, or from gh)
git switch staging && npm run check:fast       # the checks the workflow runs on staging too
npm run staging -- sync --push                 # force-push, only over the state this clone last fetched (--force builds even if nothing changed)
npm run staging -- sync --pulls pulls.json     # the open pull requests from a file (the REST API's list), to try a selection without labeling anything
npm run staging -- list                        # what origin/staging was built from, and whether those branches have moved
```

A hand push is replaced by the next workflow run, so use it to look, not to keep. `--report` (checks, comments, labels) is for the workflow: only a GitHub App can write a check run, so it needs the workflow's own token, not a personal one.

## The staging Preview

The branch is deployed as the Cloudflare [Worker Preview](https://developers.cloudflare.com/workers/previews/) named `staging` (`wrangler preview`, open beta, Wrangler 4.135 or later; the pipeline pins a newer one). A Preview is not the production Worker and not a version of it, and it does not inherit the production Worker's settings:

- Its variables and bindings are the `previews` block of `wrangler.jsonc`, the same block every pull request Preview uses: a D1 database of their own (`riglam-practice-staging`, shared by staging and the pull request Previews), lower budgets (`DEVICE_DAILY_BUDGET_USD` and `GLOBAL_DAILY_BUDGET_USD`) and, once they are set, the secrets of the Preview base configuration. A pull request that adds a table or changes the server runs against that database and never touches production data. Because the database is shared, so are its budget counters and accounts.
- Its address is `staging-riglam-practice.<account>.workers.dev`, different from production, so the app installed from it is a separate app with its own stored data, named "Riglam practice (staging)". Passkeys belong to the host name, so accounts made there stay there.
- The build carries the Preview icon (`public/icons/preview`, a yellow ground) in the page, the manifest and the home-screen icon, not the Main one (`public/icons`, a red ground); both are the same shapes with the same fine grain, the PNGs carrying it and the SVG favicon not. The staging deploy sets `RIGLAM_ICON_SET=preview`; a build on Workers Builds of any branch but `main` gets it by itself (`WORKERS_CI_BRANCH`, [scripts/lib/icon-set.mjs](../scripts/lib/icon-set.mjs)), so the Previews that pull requests get carry it too and none of them is taken for the real app.

```sh
git switch staging
npm run staging -- deploy     # npm ci, the PWA build, the D1 migrations of the staging branch, wrangler preview --name staging
```

`/staging-build.json` on the address says which commit and pull requests it was built from. The definitions and the tutor's notes are in the staging database, not in the build: they are locked until the course data is loaded into it (`npm run data:publish -- --config wrangler.staging-migrations.jsonc`, once a pull request that keeps them on the server is on the branch) and the address carries the Magic Key (`#k=<words>`, [DATA.md](DATA.md)).

### Deploying from a build service

`npm run staging -- deploy --here` does the same for whatever commit is checked out, without the checks that the working tree is the pushed `staging` branch. Cloudflare Workers Builds runs it on every push of `staging`, which is how the workflow's push becomes a deploy: in the Worker's *Settings → Builds*, the Preview `staging` (it is made by the first push of the branch) has settings of its own, separate from the base ones that every pull request Preview gets: leave its build command empty and set its deploy command to `npm run staging -- deploy --here`. The base deploy command stays Cloudflare's default `npx wrangler preview`, which is right for a pull request: it names the Preview after the branch and applies no migrations. If the base command is the script instead, a build whose branch, named in `WORKERS_CI_BRANCH`, is not `staging` gets the same result (the script builds the branch and runs `wrangler preview`). Giving `staging` the plain `npx wrangler preview` would deploy it without its migrations and its app name. The script is on `main`, so a branch made before that has to merge `main` first, or its build stops with `Missing script: "staging"`.

### Migrations

A Preview does not apply migrations itself, and the database is shared, so one place does: the build of `staging` runs `wrangler d1 migrations apply riglam-practice-staging` for the migrations of the merged tree, before it deploys. A pull request that adds a migration therefore reaches the shared database when it is labeled, and its own branch Preview works from then on. Nothing else applies migrations to that database, and production's are applied by hand ([SERVER.md](SERVER.md)).

- A database keeps the tables of a migration even after the pull request that added it leaves staging. To start again, delete the database, create it again, put the new id into `wrangler.jsonc` (`previews.d1_databases`) and `wrangler.staging-migrations.jsonc`, and deploy.
- Two pull requests that each add "the next" migration number both reach the database, in the order of their names; the rebuild warns about it in the run summary.
- A migration run by hand (in the dashboard's console, with `d1 execute`) is not recorded as applied, and the next deploy tries it again and stops at "already exists". Record it: `INSERT INTO d1_migrations (name) VALUES ('0008_name.sql')` in the staging database.

### One-time setup

1. The label `staging` in the repository (*Issues → Labels*).
2. `npx wrangler login`.
3. The database: `npx wrangler d1 create riglam-practice-staging`, and put its id into `wrangler.jsonc` (`previews.d1_databases`) and `wrangler.staging-migrations.jsonc`. Wrangler's migration command does not read the `previews` block, which is why the second file declares the same database at the top level.
4. `npm run staging -- deploy` once, which creates the Preview.
5. The two secrets, `ANTHROPIC_API_KEY` and `RIGLAM_DATA_KEY`: a new Preview is given the secrets of the Preview base configuration (set in the dashboard under the Worker's settings, or with `npx wrangler preview base-config secret put <NAME>`), so with those set there is nothing to do. Without them, or to give this Preview a different value, use `npx wrangler preview secret put <NAME> --name staging` after the first deploy. Every Preview made later gets the base secrets too.
6. Optional: the repository secret `STAGING_TOKEN`, for the workflow's push of `staging`. The workflow pushes with the token it is given, and a push made with that token starts the Workers Builds build, as one made by a person does. If a push is ever refused (GitHub can refuse a token without the `workflow` scope a push that changes a file under `.github/workflows/`) or the build does not start, a fine-grained token with *Contents: write* on this repository, or a classic one with the `workflow` scope, fixes it. The workflow uses it only to push.

The Preview must not share its name with the one that pull requests or `main` get from the pipeline ([DEPLOY.md](DEPLOY.md)), or a deploy of one would replace the other.

## What the workflow can and cannot do

- It holds no Cloudflare credential; the deploy is Workers Builds', which is why a push is all it needs.
- It runs the script of `main`, never the one of a pull request, and never checks out or runs a pull request's code to build the branch: it only merges the branches with git. The checks job does run the merged code (`npm ci`, lint, tests), with a read-only token and no secret, and without a cache that `main`'s CI could read.
- A pull request's branch is never changed by it. A conflict is reported, not resolved.
