# Staging

Pull requests are reviewed and tested one at a time, and some of them wait on others. The `staging` branch shows them together: it is `main` with the open pull requests merged in, in the order they will land, and it can be deployed as a Worker Preview of its own, so a change can be tried in the running app before anyone merges it.

## What the branch is

- It is derived. A script builds it from `main` and a list of branches, and it is force-pushed each time. Nobody commits to it, nobody opens a pull request from it or into it, and it is never merged. A fix belongs in the pull request's own branch; the next rebuild picks it up.
- The list is `staging.json` at the root of the branch (the only file on it that `main` does not have): the base branch and the branch of each pull request, in merge order. The last commit of the branch is the one that writes it, and its message records the commit of each branch that went in.
- The pull request that adds this script is the first on the list until it is merged, because a branch without the script could not be rebuilt. The release pull request (`chore(main): release ...`) is not on the list. Neither is a pull request that is not meant to land.
- Pull requests should be stacked only when one really depends on another. Independent changes each start from `main`; staging is where they meet.

## The loop

```sh
npm run staging -- --add claude/some-branch    # rebuild: main, then the listed branches (--add and --remove change the list)
git switch staging && npm run check:fast      # the checks run on staging itself, where two pull requests can break each other
npm run staging -- push                        # force-push, only over the state this clone last fetched
npm run staging -- list                        # what origin/staging was built from, and whether those branches have moved
```

`npm run staging` with no arguments rebuilds from the list on `origin/staging`, which is what to run when a pull request has new commits. The script stops at the first branch that does not merge cleanly and names it with the files in conflict. Fix that in the pull request (merge `main` or the branch it conflicts with into it, as for any pull request), push it, and rebuild.

When a pull request is merged or closed, rebuild with `--remove <branch>`. A branch whose change is already in `main` is reported as "adds nothing".

The local `staging` branch is moved to the result, with the working tree if it is checked out (it must be clean).

## The staging Preview

The branch is deployed as the Cloudflare [Worker Preview](https://developers.cloudflare.com/workers/previews/) named `staging` (`wrangler preview`, open beta, Wrangler 4.135 or later; the pipeline pins a newer one). A Preview is not the production Worker and not a version of it, and it does not inherit the production Worker's settings:

- Its variables and bindings are the `previews` block of `wrangler.staging.jsonc`: its own D1 database (`riglam-practice-staging`), lower budgets (`DEVICE_DAILY_BUDGET_USD` and `GLOBAL_DAILY_BUDGET_USD`) and, once they are set, its own secrets. A pull request that adds a table or changes the server runs against that database and never touches production data.
- Its address is `staging-riglam-practice.<account>.workers.dev`, different from production, so the app installed from it is a separate app with its own stored data, named "Riglam practice (staging)". Passkeys belong to the host name, so accounts made there stay there.
- The file names the production Worker only because a Preview belongs to a Worker. It is for `wrangler preview`; `wrangler deploy` with it would put a build without a database on production, so the script never runs it.

```sh
git switch staging
npm run staging -- deploy     # npm ci, the PWA build, the D1 migrations of the staging branch, wrangler preview --name staging
```

`/staging-build.json` on the address says which commit and branches it was built from. The definitions and the tutor's notes are in the staging database, not in the build: they are locked until the course data is loaded into it (`npm run data:publish -- --config wrangler.staging-migrations.jsonc`, once a pull request that keeps them on the server is on the branch) and the address carries the Magic Key (`#k=<words>`, [DATA.md](DATA.md)).

### Deploying from a build service

`npm run staging -- deploy --here` does the same for whatever commit is checked out, without the checks that the working tree is the pushed `staging` branch. Cloudflare Workers Builds can run it on every push of `staging`: in the Worker's *Settings → Builds*, let the `staging` branch build (branch control) and set the deploy command for non-production branches to `npm run staging -- deploy --here` (Cloudflare has one such command for all of them; the script skips a build whose branch, named in `WORKERS_CI_BRANCH`, is not `staging`). The default, `npx wrangler preview`, reads `wrangler.jsonc` and would give the Preview the production name and no database.

### One-time setup

1. `npx wrangler login`.
2. The database: `npx wrangler d1 create riglam-practice-staging`, and put its id into `wrangler.staging.jsonc` (`previews.d1_databases`) and `wrangler.staging-migrations.jsonc`. Wrangler's migration command does not read the `previews` block, which is why the second file declares the same database at the top level.
3. `npm run staging -- deploy` once, which creates the Preview.
4. The two secrets, `ANTHROPIC_API_KEY` and `RIGLAM_DATA_KEY`: a new Preview is given the secrets of the Preview base configuration (set in the dashboard under the Worker's settings, or with `npx wrangler preview base-config secret put <NAME>`), so with those set there is nothing to do. Without them, or to give this Preview a different value, use `npx wrangler preview secret put <NAME> --name staging -c wrangler.staging.jsonc` after the first deploy. Every Preview made later gets the base secrets too.

A database keeps the tables of a migration even after the pull request that added it is taken off the list. To start it again, delete the database, create it again, put the new id into both files and deploy.

The Preview must not share its name with the one that pull requests or `main` get from the pipeline ([DEPLOY.md](DEPLOY.md)), or a deploy of one would replace the other.

## Without CI

Nothing here needs GitHub Actions. The checks that CI runs are the commands in [DEVELOPING.md](DEVELOPING.md): `npm run check:fast` often, and `npm run check` (lint, types, both builds, every test) on a pull request's branch before it is merged. Run `npm run check:fast` on `staging` after each rebuild, because that is where two pull requests can break each other.
