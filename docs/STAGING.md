# Staging

Pull requests are reviewed and tested one at a time, and some of them wait on others. The `staging` branch shows them together: it is `main` with the open pull requests merged in, in the order they will land, and it can be deployed to a Worker of its own, so a change can be tried in the running app before anyone merges it.

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

## The staging Worker

The branch is deployed to the Worker `riglam-practice-staging` (`wrangler.staging.jsonc`), not to a preview of the production Worker:

- A preview of the production Worker shares its secrets and its database, and anything that uploads or edits a version of that Worker can end up as the production code (a secret changed in the dashboard builds on the latest uploaded version, whatever it is). A pull request that adds a table or changes the server must not run against production data.
- The staging Worker has its own D1 database, its own secrets and lower budgets (`DEVICE_DAILY_BUDGET_USD` and `GLOBAL_DAILY_BUDGET_USD` in its config). Its address is different, so the app installed from it is a separate app with its own stored data, named "Riglam practice (staging)". Passkeys belong to the host name, so accounts made there stay there.

```sh
git switch staging
npm run staging -- deploy     # npm ci, the PWA build, the D1 migrations of the staging branch, wrangler deploy
```

`/staging-build.json` on the deployed address says which commit and branches it was built from. The definitions are locked until the address carries the study group's key (`#k=<key>`, [DATA.md](DATA.md)).

### One-time setup

1. `npx wrangler login`.
2. Create the database and put its id into `wrangler.staging.jsonc`: `npx wrangler d1 create riglam-practice-staging`.
3. `npm run staging -- deploy` once, which creates the Worker.
4. Give it the two secrets, each at a prompt: `npx wrangler secret put ANTHROPIC_API_KEY -c wrangler.staging.jsonc` and the same for `RIGLAM_DATA_KEY`. Never upload versions to this Worker with `wrangler versions upload`; only `deploy`.

A database keeps the tables of a migration even after the pull request that added it is taken off the list. To start it again, delete the database, create it again, put the new id into the config and deploy.

## Without CI

Nothing here needs GitHub Actions. The checks that CI runs are the commands in [DEVELOPING.md](DEVELOPING.md): `npm run check:fast` often, and `npm run check` (lint, types, both builds, every test) on a pull request's branch before it is merged. Run `npm run check:fast` on `staging` after each rebuild, because that is where two pull requests can break each other.
