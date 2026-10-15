# riglam-practice

Practice in logic and debate on the "path of reasoning" (*rigs lam*): drills for the Dudra and Tarig courses. The first drill compares two phenomena (pick the relation, then give an example for each combination); the second asks the four debate questions about a pair.

One source builds two things:

| Build | What it is | Command | Output |
|---|---|---|---|
| **PWA** | The installable app: works offline, keeps answers on the device (IndexedDB), self-hosted fonts. | `npm run build:pwa` | `dist/pwa/` |
| **Artifact** | The same page as one self-contained HTML file for the Claude artifact frame, where design and logic are iterated through comments and Claude's own `db` and `sample` capabilities. | `npm run build:artifact` | `dist/artifact/index.html` |

## Quick start

```sh
nvm use            # Node 22
npm ci
npm run dev        # the PWA with hot reload at http://localhost:5173 (open it once as .../#k=<key> to unlock the definitions);
                   # Explain, the chat and the check lab work with a stand-in for the model, ?ai=off shows the app without it
npm run build      # both builds (the artifact build needs the data key, see docs/DATA.md)
npm test           # builds, then unit tests and browser tests (needs Chromium: npx playwright install chromium)
npm run check:fast # lint, typecheck and unit tests: seconds, no browser
npm run check      # lint, typecheck + everything above
```

In the Claude desktop app, "Preview" starts the same dev server and shows it in the Browser pane (`.claude/launch.json`).

## Layout

```
index.html                 PWA entry (the page markup is included from src/app/markup.html)
src/app/                   the page, shared by both builds: app.js (entry), state.js, feature modules in folders, app.css (an index of styles/*.css), markup.html, felt tiles
src/data/                  the term data: open JSON, plus the definitions and notes encrypted (docs/DATA.md)
src/ai-shared/             the tutor's card, prompts and lookup tools as pure TypeScript functions of the term data (used by the page; a server can use them too)
src/domain/                the rules of the practice (pairs and their draw, grading, Claude's verdicts) as pure TypeScript functions of the term data
src/platform/              the Platform interface (data, `db`, `sample`) that each build implements
src/pwa/                   PWA only: platform adapter, local `db` (IndexedDB), key dialog, service worker registration, fonts
src/artifact/              artifact only: platform adapter (embedded data, `window.claude`), head (title, font links)
worker/                    the server: a Cloudflare Worker for /api/* (tutor access check, spend budgets), D1 schema
src/ai/                    the contract between page and server (protocol, access proof), shared by both
scripts/                   build-artifact, artifact-verify, data (key, import, export), fonts, icons, Vite plugins
tests/unit/                Vitest unit tests (artifact comparison, artifact and PWA build contracts, encrypted data, the shape of src/app, the tutor code in src/ai-shared, the rules in src/domain)
tests/worker/              Vitest tests of the server with stand-ins for D1 and the model API
tests/e2e/                 Playwright: PWA specs, parity with the artifact build, the layout matrix, and the legacy page suite
tests/legacy/              the page's regression suite (harness, 28 test files)
public/                    icons
docs/                      developing, architecture, term data and key, artifact loop, deploy, releasing, testing
.github/workflows/         CI, preview deploys, release
```

## Docs

- [Developing](docs/DEVELOPING.md): where a change goes, the rules the tests enforce, what to run before a pull request.
- [Architecture](docs/ARCHITECTURE.md): how one source becomes two builds, the runtime seam, data, storage.
- [The artifact loop](docs/ARTIFACT-LOOP.md): how iterating in the Claude artifact keeps working, and how changes flow into this repo.
- [Testing](docs/TESTING.md): the layers, how to run them, the legacy suite.
- [The term data](docs/DATA.md): open and encrypted parts, the key, how to refresh them.
- [Deploy](docs/DEPLOY.md): hosting, previews, one-time setup.
- [The server](docs/SERVER.md): the tutor Worker, access proof, budgets, setup, tests.
- [Releasing](docs/RELEASING.md): conventional commits and release-please.

## Status

Early: the page is the one developed as a Claude artifact. Answers stay on the device. A small server for the tutor exists but the page does not use it yet, so the features that ask Claude (tutor, answer checking) are available only in the artifact build.

Licence: AGPL-3.0, see `LICENSE`. The self-hosted fonts in `src/pwa/fonts` (Inter, EB Garamond, Merriweather, Noto Sans Math) are distributed under the SIL Open Font License 1.1 by their authors, via Google Fonts; their notices and the licence text are in `public/licenses/fonts-OFL.txt`, which the app serves at `licenses/fonts-OFL.txt`.
