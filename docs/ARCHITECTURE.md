# Architecture

## One source, two builds

The page is a plain-DOM app (no framework): the UI is built with a small `el()` helper and re-rendered as a whole, and the state is one shared object. It was written as a single artifact script and was split into the modules below without changing what it does; the browser tests are what keeps it that way.

```
src/app/  (app.js, modules, app.css + styles/, markup.html, felt-*.png)   shared by both builds
        │
        ├── src/entry-pwa.ts       + src/pwa/*    → vite build            → dist/pwa/        (PWA)
        └── src/entry-artifact.ts  + src/artifact/* → scripts/build-artifact.mjs → dist/artifact/index.html

src/platform/types.ts   the Platform interface both builds implement (and the tests mock)
```

What differs between the builds is kept out of `src/app`:

| | PWA | Artifact |
|---|---|---|
| The platform (`loadData`, `db`, `sample`) | `src/pwa/platform.ts`: `db` is the local store, `sample` is `null` | `src/artifact/platform.ts`: `db` and `sample` come from `window.claude`, which the artifact frame provides |
| Term data | the open data (`drill-data.json`, plain) and the encrypted definitions (`course-definitions.enc`), both precached; the key comes from the shared link (`src/pwa/platform.ts`, `src/pwa/unlock.ts`); the notes are not included | everything, merged at build time with the data key (`scripts/vite-full-data.mjs`), embedded in the page's script |
| Fonts | self-hosted woff2 files (`src/pwa/fonts`, made by `npm run fonts` from the same Google Fonts link) | the Google Fonts link in `src/artifact/head.html` |
| Felt tiles | files in `dist/pwa/assets` | data URIs in the page's CSS |
| Document | `index.html` with a viewport meta, theme colour, manifest, icons | an HTML fragment (`<title>`, font links, `<style>`, markup, `<script>`); the Artifact tool adds the document skeleton |
| Ground rules of the frame | copied in `src/pwa/shell.css` (safe-area padding, `[hidden]`) | supplied by the frame |
| Service worker, install | yes | no (the frame forbids service workers) |

## The page code

```
src/app/
  app.js        the entry: startApp(platform), boot, the test hook
  state.js      the shared state: one exported object, `state`, plus the preferences saved on the device
  core/         vocabulary and helpers that depend on nothing else: relations (rel), DOM helpers (dom), viewport, small utilities
  practice/     Relations: the term universe and pair draws, grading, saving answers, favourites, skipped pairs, the screens, the terms panel
  debate/       Pervasions (the four questions): wording, flow and grading, the screens
  review/       the Review tab: answers, mistakes, favourites, debate statistics, check-lab review
  ai/           the tutor (prompts, per-pair card, lookup tools), the check lab, flags
  shell/        rendering, tabs, options, the chat overlay, keyboard shortcuts, timers and the toolbar
```

- Every variable that used to be module-level is a property of `state` (`state.ui`, `state.cur`, `state.db`, ...), because an ES module cannot assign to a binding it imports. A module-level `let` outside `state.js` fails a unit test.
- Modules import each other freely, including in cycles (the screens call the actions and the actions render). That works because only functions are called across modules, and only after loading; do not call an imported function while a module loads. Modules whose top-level code wires listeners (`core/viewport.js`, `shell/render.js`, `shell/keys.js`, `shell/timers.js`) are imported by the entry for that effect.
- `core/` and `state.js` import only each other (a unit test checks it); everything else may import everything.
- `tests/unit/app-modules.test.ts` also checks that every module is reachable from `app.js`, so none is left out of a build.

## The platform

The page does not know which build runs it. Each entry file calls `startApp(platform)` (the export of `app.js`), and the platform (`src/platform/types.ts`) offers three things:

- `loadData()`: the term data. When it rejects, the page shows its "no data" screen.
- `db()`: the document store, or `null`. Without it the page runs, but saves nothing.
- `sample()`: model calls, or `null`. Without it the page hides the tutor, Explain and the check lab.

The shapes of `db` and `sample` are the artifact runtime's (`collection/doc/where/orderBy/limit/onSnapshot`; one call from a prompt or turns), so the artifact adapter passes `window.claude` through and the PWA implements the same interface locally. The page does not branch on the build. The PWA entry also leaves the platform at `window.__riglam.platform` for the browser tests and the console.

A block at the end of `src/app/app.js` is the test hook (`window.__riglamTest`, inert unless a test defines it).

## The local `db`

`src/pwa/local-db.ts` implements the part of the artifact runtime's `db` that the page uses and a bit more (documents at `collection/id`, `get/set/update/delete`, `where/orderBy/limit/get/onSnapshot`, `add`, `acquire`; frozen snapshots; `invalid_argument` and `TypeError` rules from the runtime's `db.d.ts`). Reads come from memory, writes go to IndexedDB (database `riglam`, store `docs`), other tabs are told through a `BroadcastChannel`. If IndexedDB is not available (some private modes) the app keeps working in memory for that session.

When a server arrives, a second adapter with this interface replaces it; the page does not change.

Collections the page uses: `batches`, `answers`, `favorites`, `skips`, `debates`, `labruns`, `flags`. Their document shapes are defined by `app.js`. Do not rename a collection or change a shape without a migration: answers already stored (in a published artifact's database or in a browser) depend on them.

## Data

The term data (the Dudra terms, their classification chains, the everyday-items list and aliases, as exported from the knowledge base) is kept in three files: the open data `src/data/drill-data.json` (68 KB, plain) and the encrypted definitions and notes `src/data/course-definitions.enc` and `src/data/course-notes.enc`. [DATA.md](DATA.md) describes the tiers, the key, and how to refresh the data (`npm run data:import`). The repo stores the snapshot, not the pipeline. The PWA ships the open data and the encrypted definitions and unlocks the definitions with the key from the shared link; the artifact build merges everything at build time and needs the key.

## Styling

`src/app/app.css` is an index: it imports the files in `src/app/styles/` (`00-tokens.css`, `01-base.css`, ...) and nothing else. Both builds import `app.css`, so a change to a stylesheet needs no change elsewhere. The tokens file carries the "Logic and Debate" design system values the page uses (booklet palette, felt per cover colour, rhombus marks).

The files are layers in cascade order, numbered to say so. The page grew by versions, and a later block overrides an earlier rule on purpose (`.grid` is set in `02-card.css` and adjusted in `15-result-chips.css` and `17-table-fit.css`, for instance). So the order of the imports is part of the style: add a new file at the end, or put a new rule next to the rules it belongs to, and move a rule to another file only together with what depends on its position. `tests/unit/styles.test.ts` checks that the index imports every file once, in order. The felt tiles sit next to `app.css`, so the url in the tokens file is `../felt-*.png`; Vite rewrites it for each build (a file in `dist/pwa/assets` for the PWA, a data URI in the artifact).

To check that a CSS change moved nothing, build before and after: `dist/pwa/assets/index-*.css` is minified, so an equivalent reordering of files gives the same bytes.

## Known gaps

- No server: no answer checking by Claude, no tutor chat, no check lab, no shared base (the page hides these when `sample` is `null`).
- No import of the answers collected in the artifact into the installed app, and no sync between devices.
- `app.js` is one JavaScript module that is not type-checked yet; its three lint warnings (unused variables) are left as found. The adapters, the platform types and the tests are TypeScript (`npm run typecheck`).
