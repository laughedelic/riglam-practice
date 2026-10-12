# Architecture

## One source, two builds

The page is a plain-DOM app (no framework): `src/app/app.js` builds the whole UI with a small `el()` helper and keeps state in module-level variables. It was written as a single artifact script and moved here unchanged, so the code is still one large module. Splitting it into modules is a later step, guided by the section markers in the file and covered by the tests.

```
src/app/app.js  app.css  markup.html  felt-*.png        shared by both builds
        │
        ├── src/entry-pwa.js       + src/pwa/*    → vite build            → dist/pwa/        (PWA)
        └── src/entry-artifact.js  + src/artifact/* → scripts/build-artifact.mjs → dist/artifact/index.html
```

What differs between the builds is kept out of `src/app`:

| | PWA | Artifact |
|---|---|---|
| `window.claude` (the capability host the page asks for `db` and `sample`) | `src/pwa/runtime.js`: `db` is the local store, `sample` is `null` | provided by the artifact frame |
| Term data | the open data (`drill-data.json`, plain) and the encrypted definitions (`course-definitions.enc`), both precached; the key comes from the shared link (`src/pwa/runtime.js`, `src/pwa/unlock.js`); the notes are not included | everything, merged at build time with the data key (`scripts/vite-full-data.mjs`), embedded in the page's script |
| Fonts | self-hosted woff2 files (`src/pwa/fonts`, made by `npm run fonts` from the same Google Fonts link) | the Google Fonts link in `src/artifact/head.html` |
| Felt tiles | files in `dist/pwa/assets` | data URIs in the page's CSS |
| Document | `index.html` with a viewport meta, theme colour, manifest, icons | an HTML fragment (`<title>`, font links, `<style>`, markup, `<script>`); the Artifact tool adds the document skeleton |
| Ground rules of the frame | copied in `src/pwa/shell.css` (safe-area padding, `[hidden]`) | supplied by the frame |
| Service worker, install | yes | no (the frame forbids service workers) |

The page itself has exactly two seams, both visible in `app.js`:

1. It asks `window.claude.use("db")` and `window.claude.use("sample")` and copes with `null`. That is the contract of the artifact runtime, so the PWA implements the same interface instead of the page branching on the build.
2. It loads its data with `window.__riglam.fetchData()`, which each build defines (`src/pwa/runtime.js`, `src/artifact/runtime.js`).

A third block at the end of `app.js` is the test hook (`window.__riglamTest`, inert unless a test defines it).

## The local `db`

`src/pwa/local-db.js` implements the part of the artifact runtime's `db` that the page uses and a bit more (documents at `collection/id`, `get/set/update/delete`, `where/orderBy/limit/get/onSnapshot`, `add`, `acquire`; frozen snapshots; `invalid_argument` and `TypeError` rules from the runtime's `db.d.ts`). Reads come from memory, writes go to IndexedDB (database `riglam`, store `docs`), other tabs are told through a `BroadcastChannel`. If IndexedDB is not available (some private modes) the app keeps working in memory for that session.

When a server arrives, a second adapter with this interface replaces it; the page does not change.

Collections the page uses: `batches`, `answers`, `favorites`, `skips`, `debates`, `labruns`, `flags`. Their document shapes are defined by `app.js`. Do not rename a collection or change a shape without a migration: answers already stored (in a published artifact's database or in a browser) depend on them.

## Data

The term data (the Dudra terms, their classification chains, the everyday-items list and aliases, as exported from the knowledge base) is kept in three files: the open data `src/data/drill-data.json` (68 KB, plain) and the encrypted definitions and notes `src/data/course-definitions.enc` and `src/data/course-notes.enc`. [DATA.md](DATA.md) describes the tiers, the key, and how to refresh the data (`npm run data:import`). The repo stores the snapshot, not the pipeline. The PWA ships the open data and the encrypted definitions and unlocks the definitions with the key from the shared link; the artifact build merges everything at build time and needs the key.

## Styling

`src/app/app.css` carries the "Logic and Debate" design system tokens it uses (booklet palette, felt per cover colour, rhombus marks) inline, as the artifact always did.
## Known gaps

- No server: no answer checking by Claude, no tutor chat, no check lab, no shared base (the page hides these when `sample` is `null`).
- No import of the answers collected in the artifact into the installed app, and no sync between devices.
- `app.js` is one module. Its three lint warnings (unused variables) are left as found.
