# Practice page: tests and build sources

Snapshot of 2026-10-12 (page version 63, version id 1791778425-4118). The tests are refreshed after each page version; the snapshot in `../src/` and `../relations-drill.html` is the matching one.

## What is here

- `tests/`: the browser tests (Playwright driving Chromium), the harness, scans, the runner and the data fixture.
  - `harness.js`: loads the built page, injects a test hook `window.__t` at the end of the page's script, mocks `db` (five collections plus `labruns`, `flags`) and `sample` (the AI), and serves `drill-data.json` for the page's `fetch("drill-data.json")`. `open(viewport, contextOptions)` returns `{br, pg, errs}`.
  - `testNN.js`: one file per page version or area; each prints `PASS ...` / `FAIL ...` lines and exits non-zero on a failure. `test40f_noskips.js` is a variant of `test40f.js` kept for reference.
  - `sweep63.js` (every text field made very wide by default, in the main states: nothing may pass its container; `UNFIX=1` removes the v63 fix to prove the sweep detects the bug), `scanx3.js`, `scan47.js`, `scan48.js`, `ring.js`, `scanx.js`, `scanx2.js`: layout scans (overflow, clipping, focus rings) at 320 to 1280 px. Known intended result: `scanx3` reports `SPAN.exn` CLIPX at `debate-rel` (an ellipsis on purpose).
  - `t55b.js`: Blitz with skipping.
  - `runall.sh`: runs the test files in order and counts `FAIL|THROWN|TimeoutError|^Error|^TypeError|^CRASH` lines per file.
  - `drill-data.json`: the term data the page loads (same file as `../drill/drill-data.json`).
- `src/`: the page is built, not hand-written. `base.html` is the page of version 39; `patch40.py` applies the part files (`p1_render.js`, `p2_quiz.js`, `p3_review.js`, `p4_over.js`, `p5_debate.js`, `blitz.js`, `skip.js`, `lab.js`, `new.css`, `shell.html`) to it and writes `relations-drill.html`. `build.sh` runs `patch40.py`, extracts the script and runs `node --check`.

## Run

- Node 22 (`/opt/node22/bin/node`), global `playwright` at `/opt/node22/lib/node_modules/playwright`, Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Do not run `playwright install`.
- The artifact no longer runs Quorum itself (the three-model runs of the page were dropped from it; Quorum is now a mode of the app's server, tested in tests/e2e/pwa/quorum.spec.js), so the harness has no mock for it and `test57` is gone.
- One test: `node test61.js`. All: `sh runall.sh`. A full run takes several minutes; do not rebuild the page while it runs. Random pairs make a few checks flaky; rerun a failing file once before looking into it.
- Do not run two at once against the same page file, and do not rebuild while a run is going.

## Paths outside this folder that the files assume

All of these are the same absolute scratchpad directory of the practice session: `/tmp/claude-0/-home-claude/ad54899a-77cf-5f0e-a089-1602e62c0cd2/scratchpad/v40/`.

- `harness.js` (`D`): where `relations-drill.html` and `drill-data.json` are read. The page file is the built page, not the one in `../`.
- Every `testNN.js` and `ring.js`/`scan*.js` that saves screenshots uses `D+'t/'`; create a `t/` folder next to them. Scripts using `D` also have it as a constant at the top.
- `patch40.py` (`D`) and `build.sh` (`cd`) read and write the same directory.
- To use the files elsewhere: replace that directory string with `./` (it ends in a slash in the JS files and in `patch40.py`), keep `drill-data.json`, the built `relations-drill.html` and a `t/` folder in that directory.
- Browser path: `harness.js` has the Chromium executable path hard-coded (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

## Things to know

- The hook injection in `harness.js` matches the end of the page's script (`})();` before `</script>`); a page that no longer ends that way needs the regular expression changed. It exports internal functions and state (`cur`, `ui`, `tab`, `flags`, `skips`, `quorum`, ... ); adding a new export means adding it to that line (test40f has its own copy of the hook on its line 4).
- The mock `sample` answers with a fixed text unless a test sets `window.__reply`, `window.__delay` and similar.
- Tests do not touch the network except `http://t/**`, which the harness answers itself.
