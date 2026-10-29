# pr-stacks

A Claude Code mod that shows the open pull requests of this repository as stacks, so you can see at a glance what is ready to merge and what needs attention.

- **A pane, "PR stacks"**, opens when a session starts and reloads every 10 minutes. At the top it groups what to act on: ready to merge, waiting on CI, needs its own thread (failed checks, conflicts, behind its base, changes requested), needs coordination between threads, and stack hygiene. Below that, each stack is drawn from its top PR down to its base branch. Every PR shows its CI, merge state, owner and age.
- **`/pr-stacks`** reloads the pane and prints the same report as text. `/pr-stacks owner <key> <name>` names a thread.
- **A tool, `mcp__pr-stacks__report`**, gives the model the same text report, which helps where no pane can be drawn.

## How it works

- Stacks come from base branches: a PR whose base is another open PR's head sits on it. GitHub stacks (the `stacks` API) are read too, and a chain outside one GitHub stack is flagged, because a stack is merged from its top.
- A PR is **ready** when its checks pass and GitHub says it is mergeable. The `staging` workflow's checks (`staging`, `Rebuild staging`, `Checks on staging`) are not counted as CI. A stack is ready up to its first PR that is not.
- Two groups of PRs that change the same files (release files aside) are compared. When one already contains the other's head, the report says which one to merge first.
- GitHub is reached with `gh api` when `gh` is signed in, else with curl, else through the host's own fetch. The repository is public, so no token is required, but GitHub's anonymous limit is low.

## Owners

A PR's owner is the project thread that opened it. It is read from the thread link in the PR body (`?thread=cmsg_...`), or else from a `claude/project-thread-<token>` branch name. The names come from an owners file, which is a JSON object mapping a token or thread id to a name:

```json
{ "abc123": "Some thread" }
```

Its path is the `ownersFile` option. Names given with `/pr-stacks owner` are kept across sessions and take precedence over the file.

## Options

`repo` (default `laughedelic/riglam-practice`), `refreshMinutes` (default 10, 0 turns the timer off) and `ownersFile`. Set them in `/config`.

## Loading it

Claude Code loads it from `.claude/skills/pr-stacks/` in a trusted workspace. To load it from another folder, use `claude --plugin-dir <folder>`. Its tests run with `claude plugin test .claude/skills/pr-stacks`.
