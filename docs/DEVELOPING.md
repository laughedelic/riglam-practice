# Developing

How to make a change here without breaking what depends on it. [README.md](../README.md) has the commands and the layout, [ARCHITECTURE.md](ARCHITECTURE.md) explains how the parts fit, and [TESTING.md](TESTING.md) lists the test layers. This page says where a change goes and what to run before opening a pull request.

## Set up

```sh
nvm use         # Node 22 (.nvmrc)
npm ci
npm run dev     # the PWA with hot reload at http://localhost:5173
```

The definitions of the terms are not in the repository ([DATA.md](DATA.md)). Without them the page still runs, with the open data only. The artifact build and the tests that read definitions need the folder `data-private/`; without it, use `npm run build:pwa`, and those tests skip. `npm run dev` has no server, so the definitions stay locked there.

In `npm run dev` the parts that ask Claude (the tutor, Explain, the check lab) are served by a stand-in that calls no model. Add `?ai=slow`, `?ai=rate_limited` or `?ai=error` to the address to see how the page behaves when the model is slow or fails, and `?ai=off` to see the page without them.

## Where a change goes

| You want to change | Where | Test it in |
|---|---|---|
| Which pairs there are, how the next one is drawn, how an answer is graded, how Claude's verdict lines are read | `src/domain/` (TypeScript, no page, DOM or storage) | `tests/unit/domain.test.ts` |
| What the tutor is told, the card for a pair, the lookup tools, how a learner's words match a term | `src/ai-shared/` (TypeScript, shared with any server that calls the model) | `tests/unit/ai-shared.test.ts` |
| What the page does: screens, saving, keys, timers | the module in `src/app/` for its area (`practice/`, `debate/`, `review/`, `ai/`, `shell/`) | a Playwright spec in `tests/e2e/`, or a Vitest file for logic that has no DOM |
| How the page looks | the file for its area in `src/app/styles/` | `tests/e2e/layout/layout.spec.js` |
| Something that differs between the installed app and the artifact | `src/pwa/` or `src/artifact/` (TypeScript), never a branch on the build inside `src/app` | the unit tests of that folder |
| The term data | `npm run data:import -- <full.json>`; never by hand | `npm run data:check` |
| The app icon | the SVGs `public/icons/icon.svg` (Main) and `public/icons/preview/icon.svg` (Preview), then `npm run icons` for the PNGs, which get the generated grain of `scripts/lib/grain.mjs` (the SVGs stay flat) | `tests/unit/icons.test.ts` |

New code is TypeScript. The page modules in `src/app` are JavaScript and are type-checked with relaxed settings; they may import `src/ai-shared`, `src/domain` and `src/ui`, and nothing else from outside `src/app` (a unit test checks it).

Rules that fail a test if you break them, so you can find out early:

- Shared mutable state is a property of the `state` object in `src/app/state.js`, never a module-level `let`. Add the field to `State` in `src/app/types.ts` too.
- `src/ai-shared` and `src/domain` do not touch `window`, `document`, storage or the network.
- A stylesheet file in `src/app/styles/` is imported once, in order, from `src/app/app.css`. The order is part of the style: put a rule next to the ones it overrides.
- Interface text uses American spelling (Favorite, Practice, color, center).

## Stored data

The page stores answers, debates, favorites, skipped pairs, flags and check-lab runs on the device (or in the artifact's database). People already have these. The shape of each document is typed in `src/app/types.ts`, and the writers are checked against it, so a misspelled field fails `npm run typecheck`.

Never rename a collection or change a document shape without a migration of the data that exists. Export and import ([ARCHITECTURE.md](ARCHITECTURE.md#export-and-import)) carries a file version for this reason: an old file must still import.

## The loop

1. Run `npm run dev` and try the change in the browser, at a phone width and a desktop width if it touches the layout.
2. Write the test with the change. A rule in `src/domain` gets a unit test first.
3. `npm run check:fast` (lint, typecheck, unit tests) takes seconds; run it often.
4. `npm run check` before pushing: lint, typecheck, both builds and every test. The browser tests take a few minutes.

If a unit test about the artifact fails after you switch branches or refresh the data, the build in `dist/artifact` is stale: run `npm run build:artifact`.

The layout and the legacy tests draw random pairs. A legacy test that fails once and passes on a rerun usually depends on which pair was drawn; make it independent of the pair rather than rerunning it until it passes. A new legacy check that needs an internal of the page gets it through the test hook at the end of `src/app/app.js` ([TESTING.md](TESTING.md#the-legacy-suite)).

## Pull requests

- The title is a conventional commit (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `ci:`, `docs:`). The repository is squash-merged and the release notes are made from titles ([RELEASING.md](RELEASING.md)).
- The description follows `.github/pull_request_template.md`: Before, After, How.
- CI must pass: the aggregate check "Lint, build, test" and the title check. Each pull request also gets a preview of the installed app from Cloudflare ([DEPLOY.md](DEPLOY.md)).
- Open pull requests are shown together on the `staging` branch and its own Worker ([STAGING.md](STAGING.md)); do not commit to that branch.
- Keep a change to what it is for. The look of the page was refined over many iterations, so a style or layout change needs a reason and a before and after at phone and desktop widths.
- Do not commit definitions or notes in the clear, or the Magic Key, anywhere: not in a file, a commit message or a pull request.
