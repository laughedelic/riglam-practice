# Testing

| Layer | Where | Run | What it covers |
|---|---|---|---|
| Lint | `eslint.config.js` | `npm run lint` | `src`, `scripts`, the tests (typescript-eslint for `.ts`). The page code has relaxed rules for empty `catch` blocks and unused variables. |
| Types | `tsconfig.json`, `worker/tsconfig.json` | `npm run typecheck` | the TypeScript files (`src/platform`, `src/ai-shared`, the adapters in `src/pwa` and `src/artifact`, the entries, the unit tests). The page modules in `src/app` are JavaScript, checked with relaxed settings by `src/app/tsconfig.json` (a missing property or a wrong call fails; implicit `any` and null checks are off, `globals.d.ts` holds the ambient types), and `npm run typecheck` runs the three projects. The Worker with its tests is checked against the Workers types. |
| Unit | `tests/unit/*.test.ts` (Vitest) | `npm run test:unit` (`test:unit:watch` while editing) | the comparison behind `artifact:verify`, the shape of `src/app` (state only in `state`, `core/` stays a leaf, every module reachable from the entry), the tutor code in `src/ai-shared` (card, prompts, lookups and tools on made-up and real data; no dependency on the page or browser), the artifact build's contract (fragment, title in the first 8 KB, nothing but Google Fonts loaded, size budget), the split of the data into tiers, the Magic Key words, the committed data files (no definition in the clear in any tracked file), the PWA's tutor and definitions clients (the request and proof, reading the stream, every failure as a code), the PWA build's contract (open data only, no course files, noindex), and that the CI matrix runs every Playwright project once |
| Server | `tests/worker/*.test.ts` (Vitest) | `npm run test:unit` | the Worker ([SERVER.md](SERVER.md)): the tutor's kit (its tools and notes, on made-up data and, with the key, the real files), the access proof, settings, prices, the budget counters on the real SQL, every route and refusal, the model calls against a scripted API, and accounts and sync: the passkey ceremonies with a software authenticator, sessions, the server copy and its limits, and the device side (the sync engine and the Account actions) run against the real Worker and SQL with two or more devices |
| PWA specs | `tests/e2e/pwa/*.spec.js` (Playwright, phone and desktop) | `npm run test:e2e` (Chromium: desktop and phone; `npm run test:e2e:iphone` runs the WebKit project) | manifest and icons, offline start from the service worker cache, a newer version found, offered and started in place (`updates.spec.js`: a small server over `dist/pwa` whose worker script can change), the way out of a start that never finishes (`recover.spec.js`), the cover shown while the app starts (`cover.spec.js`), the local `db` in a real browser (CRUD, queries, snapshots, reload, second tab), export and import of the stored data, the optional account (sign-up and sign-in with Chromium's virtual authenticator, a second device receiving the documents, changes waiting offline, sign-out, deletion; the server is the Worker itself on a fake database, `tests/support/server-bridge.js`), the tutor against a stand-in server (offered only when the server says it is on; what the page sends, shows and says when it is refused or offline), the examples the page knows without it, Quorum against a stand-in that sends the run (offered only when the server says so), flag reports, voice, the locked and unlocked states of the definitions (link key, dialog, offline), the Path from its first screen to the next pair (`path*.spec.js`: each exercise, the roadmap, Review, Settings, the options sheet, the stations and their pulls and rides, the stops of the course terms, the guided forms, the scan of a check), and the same page in both builds (`parity.spec.js`: markup and positions) |
Tests that read the definitions need the folder `data-private/` (see [DATA.md](DATA.md)); without it they skip, and the artifact build and the parity spec cannot run. `npm run data:fixture` fills it with made-up text, which is what CI does, so CI holds no real course data. The PWA specs use a random Magic Key and a stand-in for `/api/course` that serves the definitions from that folder.

`npm run check:fast` (lint, typecheck, unit tests) takes seconds and needs no browser; `npm run check` is the full gate. `npm test` builds both outputs first, because the PWA specs run against `vite preview` of `dist/pwa` and the parity spec loads `dist/artifact/index.html`.

## Browsers

Playwright is pinned to 1.56.1. In the Claude cloud container, Chromium 1194 is preinstalled and matches it (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), so do not run `playwright install` there. On a laptop, `npx playwright install --with-deps chromium` (CI needs only `npx playwright install chromium`).

## Conventions

- Every PWA spec starts from `tests/support/test.js`: the Magic Key is on the device and a stand-in server accepts it (`tests/support/data-key.js`), a checked answer does not ask for its explanation by itself (the practice options' "Explanations by Claude" is When I ask unless set: the support test sets `rd-autoexplain` to `0`, and the specs that want Every answer set it to `1`), every course term is met and settled, and the app opens on its exercise. `unlock.spec.js` and the dialog specs use the plain test, to start with nothing stored.
- The page is the Path, so a spec goes where a learner goes: `tests/support/page.js` has the helpers (`ready`, `openMenu` for the roadmap, `goTo`, `openSettings`, `openSettingsPage`, `exerciseAtRest`). A test that needs an internal of the page gets it through `window.__riglamTest`, which the page calls with its test hook (end of `src/app/app.js`) when a spec defines it; a test that needs another internal adds it to that block.
- Random pairs make a check or two flaky now and then, so a failing file is retried once.
- Motion is reduced for every spec (`playwright.config.js`), so a step is never caught halfway through a slide; a spec that looks at motion asks for it.

## CI

`.github/workflows/ci.yml` runs on pull requests and on `main`. The browser tests run in parallel jobs, so a run takes about as long as the slowest of them (about 3.5 minutes).

| Job | What it runs |
|---|---|
| `static` ("Lint, build, unit tests") | lint, typecheck, both builds, the unit tests, `wrangler deploy --dry-run` |
| `browser` ("Browser tests (...)", a matrix) | `npx playwright test <args>` after building both outputs: the PWA specs of each project (desktop, phone) in `--shard` slices, and the project `pwa-iphone`: WebKit, the engine under every browser on an iPhone, which runs a few specs about layout and the first screens (`playwright.config.js` names them and says which tests it leaves out and why: the ones that rest on Chromium's close watcher or on animation timing; add one there when a bug shows only in Safari). That job installs WebKit with `--with-deps`, because its libraries are not on the runner image. CI uploads no HTML report or trace, because both record page content and step arguments, which can include the course definitions and the data key; a failure is read in the job log, or reproduced locally with `--trace on`. |
| `check` ("Lint, build, test") | passes when `static` and `browser` have passed. This is the name that branch protection requires ([RELEASING.md](RELEASING.md)), so it stays the same whatever the jobs above are called or however many there are. |

The title check, `Conventional PR title`, is a workflow of its own (`.github/workflows/pr-title.yml`), so that editing a pull request's title runs it again without starting the browser tests.

A push to a pull request cancels that pull request's earlier run. Every commit on `main` keeps its own run, so a merge that follows closely does not cancel the verdict on the one before.

The browser jobs install Chromium without `--with-deps`: the runner image has the libraries it needs, and the `apt-get` that `--with-deps` runs has stalled for minutes on a slow package mirror. Playwright reports a missing library when it starts the browser.

To repeat one job locally: `npm run build`, then the same `npx playwright test` arguments as in the matrix (for example `--project=pwa-phone --shard=2/3`). `npm run test:e2e` and `npm run check` leave out the WebKit project, so they need Chromium only; the WebKit job (`npm run test:e2e:iphone`, or `--project=pwa-iphone`) needs `npx playwright install webkit` first (with `--with-deps` on Linux), and CI runs it.

`--shard` cuts a project's tests into equal runs of consecutive tests, by count and not by time; with these specs the slices come out within about 20% of each other. Each added shard repeats the setup of a job (about 30 seconds). A new Playwright project needs an entry in the `browser` matrix; `tests/unit/ci-workflow.test.ts` fails when a project is in no job, in two, or when the shards of a project are not all there.

## Adding tests

Write new tests as native Playwright specs in `tests/e2e/pwa/` or Vitest files in `tests/unit/`. A rule of the practice is tested in `tests/unit/domain.test.ts`, not through the page.
