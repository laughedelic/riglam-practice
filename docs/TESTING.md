# Testing

| Layer | Where | Run | What it covers |
|---|---|---|---|
| Lint | `eslint.config.js` | `npm run lint` | `src`, `scripts`, new tests (typescript-eslint for `.ts`). The page code has relaxed rules for empty `catch` blocks and unused variables. The migrated `tests/legacy` files are not linted. |
| Types | `tsconfig.json`, `worker/tsconfig.json` | `npm run typecheck` | the TypeScript files (`src/platform`, `src/ai-shared`, the adapters in `src/pwa` and `src/artifact`, the entries, the unit tests). The page modules in `src/app` are JavaScript, checked with relaxed settings by `src/app/tsconfig.json` (a missing property or a wrong call fails; implicit `any` and null checks are off, `globals.d.ts` holds the ambient types), and `npm run typecheck` runs the three projects. The Worker with its tests is checked against the Workers types. |
| Unit | `tests/unit/*.test.ts` (Vitest) | `npm run test:unit` (`test:unit:watch` while editing) | the comparison behind `artifact:verify`, the shape of `src/app` (state only in `state`, `core/` stays a leaf, every module reachable from the entry), the tutor code in `src/ai-shared` (card, prompts, lookups and tools on made-up and real data; no dependency on the page or browser), the artifact build's contract (fragment, title in the first 8 KB, nothing but Google Fonts loaded, size budget), the split of the data into tiers, the Magic Key words, the committed data files (no definition in the clear in any tracked file), the PWA's tutor and definitions clients (the request and proof, reading the stream, every failure as a code), the PWA build's contract (open data only, no course files, noindex), and that the CI matrix runs every Playwright project once |
| Server | `tests/worker/*.test.ts` (Vitest) | `npm run test:unit` | the Worker ([SERVER.md](SERVER.md)): the tutor's kit (its tools and notes, on made-up data and, with the key, the real files), the access proof, settings, prices, the budget counters on the real SQL, every route and refusal, the model calls against a scripted API, and accounts and sync: the passkey ceremonies with a software authenticator, sessions, the server copy and its limits, and the device side (the sync engine and the Account actions) run against the real Worker and SQL with two or more devices |
| PWA specs | `tests/e2e/pwa/*.spec.js` (Playwright, phone and desktop) | `npm run test:e2e` | manifest and icons, offline start from the service worker cache, a newer version found, offered and started in place (`updates.spec.js`: a small server over `dist/pwa` whose worker script can change), the way out of a start that never finishes (`recover.spec.js`), the local `db` in a real browser (CRUD, queries, snapshots, reload, second tab), the practice flow saved to the device, export and import of the stored data, the optional account (sign-up and sign-in with Chromium's virtual authenticator, a second device receiving the documents, changes waiting offline, sign-out, deletion; the server is the Worker itself on a fake database, `tests/support/server-bridge.js`), no Claude-only features without a server, the tutor against a stand-in server (offered only when the server says it is on; what the page sends, shows and says when it is refused or offline), Quorum against a stand-in that sends the run (offered only when the server says so; the chip and its panel for each kind of run, the flags it raises, the Options switch), same page in both builds (markup and positions), the locked and unlocked states of the definitions (link key, dialog, offline), Home and the parked attempts (`home.spec.js`), the system Back and Options (`overlays.spec.js`), the tab bar while typing and under Options and the settings of an exercise (`settings.spec.js`) |
| Layout matrix | `tests/e2e/layout/layout.spec.js` (Playwright), scans in `tests/support/layout-scans.js` | `npm run test:e2e -- --project=layout` | the page at nine window sizes (320 to 1280 px, both sides of the 520 and 1100 px breakpoints) in the states where text is longest: question, answers, result and each chip, the explanation and its notes, the debate, Blitz, Options, Review. After every step nothing may pass the window edge or a container that clips sideways, and every control keeps room for its focus ring; some runs also make every text field wide. |
| Legacy page suite | `tests/legacy`, run by `tests/e2e/legacy.spec.js` | `npm run test:e2e -- --project=legacy` | the regression suite of the page (about 900 checks): every UI state at phone and desktop sizes, tutor, flags, Blitz, skipping, Review |

Tests that read the definitions need the folder `data-private/` (see [DATA.md](DATA.md)); without it they skip, and the artifact build, the parity spec and the legacy suite cannot run. `npm run data:fixture` fills it with made-up text, which is what CI does, so CI holds no real course data. The PWA specs use a random Magic Key and a stand-in for `/api/course` that serves the definitions from that folder.

`npm run check:fast` (lint, typecheck, unit tests) takes seconds and needs no browser; `npm run check` is the full gate. `npm test` builds both outputs first, because the PWA specs run against `vite preview` of `dist/pwa` and the legacy suite loads `dist/artifact/index.html`.

## Browsers

Playwright is pinned to 1.56.1. In the Claude cloud container, Chromium 1194 is preinstalled and matches it (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), so do not run `playwright install` there. On a laptop and in CI, `npx playwright install --with-deps chromium`.

## The legacy suite

Each file in `tests/legacy` is a node script from the page's earlier test pipeline: it opens the page with `harness.js`, prints `PASS`/`FAIL` lines and exits non-zero on a crash. `legacy.spec.js` runs them as one Playwright test per file and attaches the output.

- `harness.js` wraps `dist/artifact/index.html` in the same document skeleton the artifact frame uses and mocks `window.claude`: `db` (collections `answers`, `debates`, `batches`, `favorites`, `skips`, `labruns`, `flags`) and `sample` (the AI, with hooks such as `window.__reply`). Tests reach the page's internals through `window.__t`, which the page exports through its test hook (end of `src/app/app.js`) when the harness defines `window.__riglamTest`. A test that needs another internal adds it to that block.
- A checked answer does not ask for its explanation by itself in the old tests (Options, "Check every answer with AI", is on by default in the app): the harness starts every page with `rd-autoexplain` set to `0`, and a test passes `{autoExplain:true}` to `open` to turn it on. The PWA specs do the same through `tests/support/test.js`.
- Random pairs make a check or two flaky now and then, so a failing file is retried once.
- Not migrated: `test40f_noskips.js` (an old variant kept for reference upstream). The layout scans of the old pipeline are the layout matrix now; `ring.js` stays only as the focus-ring check some legacy tests call (`ringScan`).
- Screenshots the tests take go to `tests/legacy/out/t/` (ignored by git).

## The layout matrix

`layout.spec.js` loads the artifact build with the mock `window.claude` of `tests/support/claude-mock.js` (the explanation needs `sample`, which the PWA does not have) and seeds `Math.random`, so a size always shows the same pairs and a finding can be repeated. Motion is reduced so no step is scanned halfway through a slide. A step calls `check("name")`, which runs `scanPage` in the page and keeps the findings; the test fails at its end with every finding, each naming the step and the element (`CLIPX ASIDE.coach#coach 341/329 (reaches 1088: DIV.tutor)`). The kinds are in the head of `layout-scans.js`.

To cover a new state, add steps to a flow in the spec (or a flow), and a size to `SIZES` when a breakpoint changes. A finding is a layout bug to fix in the CSS, not a reason to loosen the scan; the only things the scan skips on purpose are inputs (they scroll their text), text with an ellipsis, and text for screen readers.

## CI

`.github/workflows/ci.yml` runs on pull requests and on `main`. The browser tests run in parallel jobs, so a run takes about as long as the slowest of them.

| Job | What it runs |
|---|---|
| `static` ("Lint, build, unit tests") | lint, typecheck, both builds, the unit tests, `wrangler deploy --dry-run` |
| `browser` ("Browser tests (...)", a matrix) | `npx playwright test <args>` after building both outputs: the legacy suite in three `--shard` slices, and the layout matrix with the PWA specs in one job. CI uploads no HTML report or trace, because both record page content and step arguments, which can include the course definitions and the data key; a failure is read in the job log, or reproduced locally with `--trace on`. |
| `check` ("Lint, build, test") | passes when `static` and `browser` have passed. This is the name that branch protection requires ([RELEASING.md](RELEASING.md)), so it stays the same whatever the jobs above are called or however many there are. |

To repeat one job locally: `npm run build`, then the same `npx playwright test` arguments as in the matrix (for example `--project=legacy --shard=2/3`).

The legacy suite is the long part, and `test40q` is its longest test (about two minutes, in one browser after another), so more legacy shards would not make a run shorter. A new Playwright project needs an entry in the `browser` matrix; `tests/unit/ci-workflow.test.ts` fails when a project is in no job, in two, or when the shards of a project are not all there.

## Adding tests

Write new tests as native Playwright specs in `tests/e2e/` (PWA behaviour; layout in `tests/e2e/layout/`) or Vitest files in `tests/unit/`. Keep adding to the legacy suite only when the change is to the page's UI states and the harness already has what you need.
