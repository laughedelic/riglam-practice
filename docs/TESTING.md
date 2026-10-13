# Testing

| Layer | Where | Run | What it covers |
|---|---|---|---|
| Lint | `eslint.config.js` | `npm run lint` | `src`, `scripts`, new tests (typescript-eslint for `.ts`). The page code has relaxed rules for empty `catch` blocks and unused variables. The migrated `tests/legacy` files are not linted. |
| Types | `tsconfig.json` | `npm run typecheck` | the TypeScript files (`src/platform`, the adapters in `src/pwa` and `src/artifact`, the entries, the unit tests). The page modules in `src/app` are JavaScript and not checked yet. |
| Unit | `tests/unit/*.test.ts` (Vitest) | `npm run test:unit` (`test:unit:watch` while editing) | the comparison behind `artifact:verify`, the shape of `src/app` (state only in `state`, `core/` stays a leaf, every module reachable from the entry), the artifact build's contract (fragment, title in the first 8 KB, nothing but Google Fonts loaded, size budget), the encrypted data format and the split (round trips, wrong key, tampering), the committed data files (no definition in the clear in any tracked file), and the PWA build's contract (open data, encrypted definitions, no notes, noindex) |
| PWA specs | `tests/e2e/pwa/*.spec.js` (Playwright, phone and desktop) | `npm run test:e2e` | manifest and icons, offline start from the service worker cache, the local `db` in a real browser (CRUD, queries, snapshots, reload, second tab), the practice flow saved to the device, no Claude-only features, same page in both builds (markup and positions), the locked and unlocked states of the definitions (link key, dialog, offline) |
| Layout matrix | `tests/e2e/layout/layout.spec.js` (Playwright), scans in `tests/support/layout-scans.js` | `npm run test:e2e -- --project=layout` | the page at nine window sizes (320 to 1280 px, both sides of the 520 and 1100 px breakpoints) in the states where text is longest: question, answers, result and each chip, the explanation and its notes, the debate, Blitz, Options, Review. After every step nothing may pass the window edge or a container that clips sideways, and every control keeps room for its focus ring; some runs also make every text field wide. |
| Legacy page suite | `tests/legacy`, run by `tests/e2e/legacy.spec.js` | `npm run test:e2e -- --project=legacy` | the regression suite of the page (about 900 checks): every UI state at phone and desktop sizes, tutor, check lab, flags, Blitz, skipping, Review |

Tests that read the definitions need the data key (`RIGLAM_DATA_KEY` or `.data-key`, see [DATA.md](DATA.md)); without it they skip, and the artifact build, the parity spec and the legacy suite cannot run. CI has the key as a secret.

`npm run check:fast` (lint, typecheck, unit tests) takes seconds and needs no browser; `npm run check` is the full gate. `npm test` builds both outputs first, because the PWA specs run against `vite preview` of `dist/pwa` and the legacy suite loads `dist/artifact/index.html`.

## Browsers

Playwright is pinned to 1.56.1. In the Claude cloud container, Chromium 1194 is preinstalled and matches it (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), so do not run `playwright install` there. On a laptop and in CI, `npx playwright install --with-deps chromium`.

## The legacy suite

Each file in `tests/legacy` is a node script from the page's earlier test pipeline: it opens the page with `harness.js`, prints `PASS`/`FAIL` lines and exits non-zero on a crash. `legacy.spec.js` runs them as one Playwright test per file and attaches the output.

- `harness.js` wraps `dist/artifact/index.html` in the same document skeleton the artifact frame uses and mocks `window.claude`: `db` (collections `answers`, `debates`, `batches`, `favorites`, `skips`, `labruns`, `flags`) and `sample` (the AI, with hooks such as `window.__reply`, `__labAns`, `__labFail`). Tests reach the page's internals through `window.__t`, which the page exports through its test hook (end of `src/app/app.js`) when the harness defines `window.__riglamTest`. A test that needs another internal adds it to that block.
- `LAB=1` turns the check lab on in every test (some tests turn it on themselves).
- Random pairs make a check or two flaky now and then, so a failing file is retried once.
- Not migrated: `test40f_noskips.js` (an old variant kept for reference upstream). The layout scans of the old pipeline are the layout matrix now; `ring.js` stays only as the focus-ring check some legacy tests call (`ringScan`).
- Screenshots the tests take go to `tests/legacy/out/t/` (ignored by git).

## The layout matrix

`layout.spec.js` loads the artifact build with the mock `window.claude` of `tests/support/claude-mock.js` (the explanation needs `sample`, which the PWA does not have) and seeds `Math.random`, so a size always shows the same pairs and a finding can be repeated. Motion is reduced so no step is scanned halfway through a slide. A step calls `check("name")`, which runs `scanPage` in the page and keeps the findings; the test fails at its end with every finding, each naming the step and the element (`CLIPX ASIDE.coach#coach 341/329 (reaches 1088: DIV.tutor)`). The kinds are in the head of `layout-scans.js`.

To cover a new state, add steps to a flow in the spec (or a flow), and a size to `SIZES` when a breakpoint changes. A finding is a layout bug to fix in the CSS, not a reason to loosen the scan; the only things the scan skips on purpose are inputs (they scroll their text), text with an ellipsis, and text for screen readers.

## Adding tests

Write new tests as native Playwright specs in `tests/e2e/` (PWA behaviour; layout in `tests/e2e/layout/`) or Vitest files in `tests/unit/`. Keep adding to the legacy suite only when the change is to the page's UI states and the harness already has what you need.
