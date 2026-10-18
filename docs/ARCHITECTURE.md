# Architecture

## One source, two builds

The page is a plain-DOM app (no framework): the UI is built with a small `el()` helper and re-rendered as a whole, and the state is one shared object. It was written as a single artifact script and was split into the modules below without changing what it does; the browser tests are what keeps it that way.

```
src/app/  (app.js, modules, app.css + styles/, markup.html, felt-*.png)   shared by both builds
        │
        ├── src/entry-pwa.ts       + src/pwa/*    → vite build            → dist/pwa/        (PWA)
        └── src/entry-artifact.ts  + src/artifact/* → scripts/build-artifact.mjs → dist/artifact/index.html

src/platform/types.ts   the Platform interface both builds implement (and the tests mock)
src/ai-shared/          what the tutor sees and can look up: pure TypeScript over the term data, used by the page and by the Worker (worker/kit.ts)
src/domain/            the rules of the practice: pairs and their draw, grading, Claude's verdicts; pure TypeScript over the term data
```

What differs between the builds is kept out of `src/app`:

| | PWA | Artifact |
|---|---|---|
| The platform (`loadData`, `db`, `sample`, `tutor`, `reports`, `account`) | `src/pwa/platform.ts`: `db` is the local store, `sample` is `null` (in `npm run dev` a stand-in, see below), `tutor` asks the app's own server (`src/pwa/tutor.ts`), `reports` sends flags to it (`src/pwa/reports.ts`), `account` is the optional sign-in with sync (`src/pwa/account.ts`) | `src/artifact/platform.ts`: `db` and `sample` come from `window.claude`, which the artifact frame provides |
| Term data | the open data (`drill-data.json`, plain, precached); the definitions are fetched from the server with the Magic Key (from the shared link or typed) and kept on the device (`src/pwa/platform.ts`, `src/pwa/course.ts`, `src/pwa/unlock.ts`); the notes are not included | everything, merged at build time from `data-private/` (`scripts/vite-full-data.mjs`), embedded in the page's script |
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
  practice/     Relations: the term universe and pair draws, grading, saving answers, favorites, skipped pairs, the screens, the terms panel
  debate/       Pervasions (the four questions): wording, flow, the screens
  review/       the Review tab: answers, mistakes, favorites, debate statistics, check-lab review
  ai/           the tutor (asking, verdicts, chat), the check lab, flags; the tutor's text and tools are built by src/ai-shared
  shell/        rendering, tabs, options, the chat overlay, keyboard shortcuts, timers and the toolbar
```

- Every variable that used to be module-level is a property of `state` (`state.ui`, `state.cur`, `state.db`, ...), because an ES module cannot assign to a binding it imports. A module-level `let` outside `state.js` fails a unit test.
- Modules import each other freely, including in cycles (the screens call the actions and the actions render). That works because only functions are called across modules, and only after loading; do not call an imported function while a module loads. Modules whose top-level code wires listeners (`core/viewport.js`, `shell/render.js`, `shell/keys.js`, `shell/timers.js`) are imported by the entry for that effect.
- `types.ts` holds the TypeScript types of the stored documents (one per collection: answers, debates, batches, favorites, skips, flags, lab runs), the pair on screen and `State`. `state.js` is annotated with `State`, so a misspelled `state.x`, or a misspelled field of a stored document, fails `npm run typecheck`. A stored shape changes there only together with a migration (see `CLAUDE.md`).
- `core/` and `state.js` import only each other, `src/ai-shared` and `src/domain` (a unit test checks it); everything else may import everything. The page imports no other code from outside `src/app`.
- What the page does around the rules (stop the clock, render, save, ask the tutor) stays in the page modules: `practice/grading.js` and `debate/flow.js` call `grade` and `gradeDebate` from `src/domain`, `practice/universe.js` calls `buildPool` and `nextPair`, and `ai/tutor.js` calls `parseVerdicts` and `applyVerdicts`.
- `tests/unit/app-modules.test.ts` also checks that every module is reachable from `app.js`, so none is left out of a build.

## The tutor code

`src/ai-shared/` is TypeScript with no dependency on the page. It holds everything that decides what the tutor sees and can look up:

| File | What |
|---|---|
| `data.ts` | the types of the term data (`DrillData`, `Term`, `Cat`, `Item`) |
| `lookup.ts` | `norm`, `makeIndex(data)` (the lookup tables), `matchItem`, `catByLabel`, `pairCats`: how a learner's words resolve to a practice item or category; `upChain` (a term and its parents) and `classNames` (the classes of the "is a" tree the tutor names an example's class from) |
| `mentions.ts` | `termMentions(index, text)`: the Dudra terms a text names, by name, alias or plural, the longest first; names that are everyday words (one, reason, definition, cause) and words in quotation marks do not count. The tutor's notes and the Terms panel underline these terms and open their definitions in place (`withTerms` in `src/app/practice/terms.js`) |
| `relations.ts`, `debate.ts` | the five relations, the four cells and the four questions in their canonical wording |
| `facts.ts` | `termFacts`, `catFacts`: what the data says about a term or category |
| `prompts.ts` | the tutor's standing instructions and the two "explain" requests |
| `card.ts` | `tutorCard(index, pair, answer)`: the first message of a tutor chat, made of the instructions, `cardBody(index, pair, answer)` (the data, the relation, the learner's answer and the page's verdicts) and `cardNotes(index, pair)` (the fine points from the sources, from `finePoints(index, categoryIds)`); a server that holds the instructions and the fine points itself asks for the body only; `explainAsk(answer)` |
| `tools.ts` | `tutorTools(index)`: the `lookup_term` and `classify_example` tools |

Every function takes a **data index** (`DataIndex`: the data plus its lookup tables) as its first argument. The page passes its `state`, which has the same five fields (`DATA`, `CAT`, `ITEMIDX`, `ALIASIDX`, `LABELIDX`); `indexData()` in `practice/universe.js` fills them with `makeIndex`. Code that talks to the model elsewhere builds an index with `makeIndex(data)` and gets the same prompt text and the same tool results. `tests/unit/ai-shared.test.ts` checks the functions on made-up data and the real open data, and that the folder imports nothing outside itself and touches no `window`, `document`, storage or network.

The page's JavaScript imports these files with their `.ts` extension; Vite compiles them for both builds.

## The rules of the practice

`src/domain/` is TypeScript on top of `src/ai-shared` (it uses the data index and the relations; `src/ai-shared` does not import it). It holds what decides which pairs there are and whether an answer is right, so that it can be tested without a browser and reused by a server:

| File | What |
|---|---|
| `universe.ts` | `cellsFor(index, a, b)` (the items in each of the four cells for two categories), `relOfCells`, `inUniverse`, `buildPool(index)` (every pair of categories worth drilling), `makePair(index, entry)` (labels, examples and the reason for each empty cell), `nextPair(index, pool, state)` (the draw: the relation least seen lately first, then a pair weighted by recent mistakes, lowered for pairs seen or skipped lately) |
| `grading.ts` | `grade(index, pair, answer)` for Relations, `gradeDebate(index, pair, answer)` for Pervasions, `judgeText` (where an example belongs), `deriveRel` (the relation three debate answers imply), `summarize` (the counts and the overall grade) |
| `verdict.ts` | `parseFactLine(line)` reads the tutor's line for an example, `Both: "the example" \| class: Taste source \| A yes: ... \| B no: ...` (the example's class, is it A, is it B, and the reason for each); `fitOf` draws the verdict for the cell from the two answers, and `noteParts` gives the note the page shows: the subject once ("Take S:"), a consequence per term in the debate's form ("It follows it is (not) P, because R"), with the pervasion of a denied term on a line under it when the tutor gives one; with the term data a listed example is placed as the grading places it and a side takes the steps `ladder.ts` gives, and a conclusion only when the example does not fit (`partsText` is the same as plain text); `parseVerdicts(text)` reads these lines, and the older `Both: ... => yes` form saved explanations have; `applyVerdicts(pair, result, verdicts)` settles the cells that were still open |
| `ladder.ts` | `rung(index, class, category, ...)`: the steps from an example's class to a term of the pair, from the term data: up the chain of parents to the term, or up to a class the data marks as excluding one the term is in (`contra`), with the sentence that says so ("A sense power is an internal form, which is a form, and nothing is both a consciousness and a form."); null when the data cannot tell. `listedItem` finds the example as the grading does |
| `types.ts`, `util.ts` | the pair, the result of a check and the pool entry; `cap`, `pick`, `gradeOf`, `isMiss` |

Randomness is a parameter (`rng`, `Math.random` by default), so the same data and the same random numbers give the same pairs. `tests/unit/domain.test.ts` checks the rules on made-up data and, on the real open data, that the right answer is graded ok for every pair the page can draw; it also checks that the folder imports nothing but itself and `src/ai-shared` and touches no `window`, `document`, storage or network.

## The platform

The page does not depend on which build runs it (Options only shows which build it is, through `about()` below). Each entry file calls `startApp(platform)` (the export of `app.js`), and the platform (`src/platform/types.ts`) offers three things:

- `loadData()`: the term data. When it rejects, the page shows its "no data" screen.
- `db()`: the document store, or `null`. Without it the page runs, but saves nothing.
- `sample()`: model calls, or `null`. The Claude artifact's own capability: the page picks the models itself and gives the model its tools.
  In `npm run dev` the PWA has a stand-in (`src/pwa/dev-sample.ts`): it calls no model and answers with fixed text in the shape the page reads (the lines of an explanation, a verdict for each example the page could not check, the check lab's JSON), streamed word by word, so these parts can be built and their layout tried without a key or a server. `?ai=off` in the address takes it away, `?ai=slow` streams slowly, `?ai=rate_limited` and `?ai=error` make it fail as the page's error messages expect. The stand-in is imported behind `import.meta.env.DEV`, so no build contains it; `tests/unit/pwa-build.test.ts` checks `dist/pwa`.
- `about()` (optional): which build runs (version, commit, build time) and whether the server has a newer one, for the Version row in Options. The PWA knows its own commit from the build (`vite.config.js`) and compares it with `build.json` next to the page, which the service worker does not precache; a staging build also lists its branches from `staging-build.json`. The artifact has none.
- `updates` (optional property): updating the installed app in place (`src/pwa/updates.ts`). A new service worker takes over as soon as it is installed (`skipWaiting`): one that waits for every page of the app to close never gets its turn on a phone, where closing the app often leaves a page alive and a cold start opens the old version again. The page that is open keeps running the version it loaded, so the app looks for a newer one when it starts, when it returns to the screen after 15 minutes, when the connection returns and when Options opens; the page is never reloaded without the reader's word (they may be in the middle of an answer), so a version that takes over is offered in a banner (`src/pwa/update-banner.ts`) and in the Version row of Options, and "Update now" reloads onto it. `index.html` also holds a small inline script: if the page still says "Loading." after 12 seconds it offers a reload and a reload that drops the service worker and its cached files (stored answers and settings are not touched). The artifact has no `updates`.
- `tutor()` (optional): a question to the app's own server ([SERVER.md](SERVER.md)), or `null`. The request is the conversation and the pair's categories; the server holds the instructions, the lookup tools and the notes. The PWA offers it when this device has the Magic Key and the server's `/api/health` says its tutor is on. The page uses `sample` when it has one, else `tutor`; with neither it hides the tutor and Explain. The check lab needs `sample`.
- `reports()` (optional): sends a learner's flag, with the stored answer it was made on, to the app's server ([SERVER.md](SERVER.md), "Flag reports"), or `null`: the place has no server for flags, or this device lacks the Magic Key. It has `send`, `withdraw` and `flush`, none of which rejects. The page (`src/app/ai/flag-reports.js`) marks a sent flag with `sentAt`. The artifact build has none, and a device without the key cannot flag.
- `account()` (optional): the optional account, or `null`: a passkey to sign in with and a server copy of the documents ([SERVER.md](SERVER.md), "Accounts and sync"). It has a view (who is signed in, what is waiting to be sent, the last message), `subscribe`, and the actions `signUp`, `signIn`, `addPasskey`, `signOut`, `deleteAccount` and `syncNow`. The PWA offers it when `/api/health` says accounts are on, or when this device used one before; the Options screen then shows an Account row. The artifact build has none.

The shapes of `db` and `sample` are the artifact runtime's (`collection/doc/where/orderBy/limit/onSnapshot`; one call from a prompt or turns), so the artifact adapter passes `window.claude` through and the PWA implements the same interface locally. The page does not branch on the build. The PWA entry also leaves the platform at `window.__riglam.platform` for the browser tests and the console.

A block at the end of `src/app/app.js` is the test hook (`window.__riglamTest`, inert unless a test defines it).

## The local `db`

`src/pwa/local-db.ts` implements the part of the artifact runtime's `db` that the page uses and a bit more (documents at `collection/id`, `get/set/update/delete`, `where/orderBy/limit/get/onSnapshot`, `add`, `acquire`; frozen snapshots; `invalid_argument` and `TypeError` rules from the runtime's `db.d.ts`). Reads come from memory, writes go to IndexedDB (database `riglam`, store `docs`), other tabs are told through a `BroadcastChannel`. If IndexedDB is not available (some private modes) the app keeps working in memory for that session.

When a server arrives, a second adapter with this interface replaces it; the page does not change.

## Account and sync (the device side)

`src/account/` is the part that does not depend on the page or the browser, so the Worker's tests can run it against the real server code: `protocol.ts` (the contract shared with the Worker), `client.ts` (one function per route, failures as codes), `sync.ts` (the engine), `outbox.ts` and `idb-outbox.ts` (what is waiting to be sent), `account.ts` (the view and the actions the Options row uses), `passkeys.ts` and `webauthn.ts` (the browser's passkeys, with the options and results converted to and from JSON by hand). `src/pwa/account.ts` joins them to the local store, Web Locks (one tab syncs at a time) and the events that mean "try now": the connection returning, the page becoming visible, a minute passing. `src/ui/account.ts` is the Options row.

The local store tells sync about each write the page makes (`LocalDb.onWrite`) and takes the server's copies without telling it back (`LocalDb.applyRemote`). Each change is noted in the outbox, one entry per document, in its own IndexedDB database (`riglam-sync`), with the time it was made. A round sends the entries and receives what changed on the server. A copy from the server replaces the local one unless the local document was changed after that copy was made; then the local change is sent next. A write the page has begun but not yet noted (`LocalDb.writing`) counts as a change too: the copy waits for the next round, and the cursor does not move past it (the copies already applied are recognized again). A copy the store refuses because of a newer write (`applyRemote` says whether it stored it) is put off the same way. Notes of one document that finish out of order do not undo each other's retry. A sync that was asked for (sign-out, Sync now) waits for the lock another tab holds, where a background round leaves the work to that tab. Changes of account run one after the other, each only if its person is still the one shown, and the end of a round (its failure included) is dropped when the account changed meanwhile. The server's copy is stored in the same IndexedDB transaction that checks the row still holds what this tab has in memory, so a newer write by another tab, not yet heard of, is not overwritten. A change of account waits for the writes still being saved and for their notes before it clears the queue, so a late write is noted for the account it was made under; a sign-out that comes while a change of account waits wins, and the change does not turn sync on afterwards. Signing out asks the server whose session it is about to end, and does not end it when another tab has signed in as someone else. When the server says accounts are off, a remembered person is forgotten and sync stops. Changes are noted from the first sign-in on, also while signed out, so nothing made offline or between sessions is lost. The first sign-in on a device offers every document it already has, at the timestamp the document carries. A different person signing in on the same device starts over the same way. A scan that failed or was cut short is started again by the next round. An answer that arrives after the account changed (here or in another tab) is dropped without being applied, and its requests are sent again. A request the server calls too large for the account's daily allowance is sent again with half as many changes. A write that the server did not take (its copy is newer) stays in the outbox until the server's copy has been stored here, so a failed store is answered again. When the server says the account holds as many documents as it may (`full`, which does not end at midnight), the deletions go first, what other devices changed is still received, and the Account row says so. The outbox keeps an index on the change time (IndexedDB version 2, added when an older database is opened), so a batch is read without loading the queue. A failed round is tried again after 15 seconds, doubling up to 15 minutes; a refusal for the day's limit waits an hour.

## Export and import

Options has a "Your data" row. Export writes everything the page keeps (the documents of the collections below and the `rd-*` settings in localStorage) to one JSON file, `riglam-practice-data` version 1; on a phone it opens the share sheet, elsewhere it downloads. Import reads such a file, shows what it would add and replace, and writes only after the person confirms. It never deletes: a document that is already there is replaced only by a copy with a later timestamp (`at`, `verifiedAt` or `updatedAt`), settings already set on the device are kept, and importing a file twice changes nothing. The comparison is made again for each document just before it is written, because the preview can be old (a check-lab verdict or another tab may have saved a newer copy meanwhile); such documents are left alone and counted. Documents called `__proto__` are left out, since the page builds objects keyed by document id. The logic is `src/store/transfer.ts` (it works on any `Db`, so it serves the artifact too and a later server adapter), the row is `src/ui/data-transfer.ts`. A change to a stored shape needs a migration of old files in `parseDataFile`, which is why the file carries a version.

Collections the page uses: `batches`, `answers`, `favorites`, `skips`, `debates`, `labruns`, `flags`. Their document shapes are defined by `app.js`. Do not rename a collection or change a shape without a migration: answers already stored (in a published artifact's database or in a browser) depend on them.

## Data

The term data (the Dudra terms, their classification chains, the everyday-items list and aliases, as exported from the knowledge base) is kept in two places: the open data `src/data/drill-data.json` (68 KB, plain) is in the repository, and the definitions and notes are on the server and in the git-ignored folder `data-private/`. [DATA.md](DATA.md) describes the tiers, the Magic Key, and how to refresh the data (`npm run data:import`, `npm run data:publish`). The repo stores the open snapshot, not the pipeline. The PWA ships the open data and fetches the definitions from the server with the Magic Key; the artifact build merges everything at build time from `data-private/`.

## Styling

`src/app/app.css` is an index: it imports the files in `src/app/styles/` (`00-tokens.css`, `01-base.css`, ...) and nothing else. Both builds import `app.css`, so a change to a stylesheet needs no change elsewhere. The tokens file carries the "Logic and Debate" design system values the page uses (booklet palette, felt per cover colour, rhombus marks).

The files are layers in cascade order, numbered to say so. The page grew by versions, and a later block overrides an earlier rule on purpose (`.grid` is set in `02-card.css` and adjusted in `15-result-chips.css` and `17-table-fit.css`, for instance). So the order of the imports is part of the style: add a new file at the end, or put a new rule next to the rules it belongs to, and move a rule to another file only together with what depends on its position. `tests/unit/styles.test.ts` checks that the index imports every file once, in order. The felt tiles sit next to `app.css`, so the url in the tokens file is `../felt-*.png`; Vite rewrites it for each build (a file in `dist/pwa/assets` for the PWA, a data URI in the artifact).

To check that a CSS change moved nothing, build before and after: `dist/pwa/assets/index-*.css` is minified, so an equivalent reordering of files gives the same bytes.

## Known gaps

- The check lab (it picks the models and judges answers itself) needs `sample`, so it exists only in the artifact build. The tutor chat and Explain work in both, in the installed app through the server's tutor ([SERVER.md](SERVER.md)).
- Answers collected in the artifact reach the installed app by export and import only. Sync copies the documents, not the settings (the `rd-*` keys in localStorage); those travel with export and import.
- The page modules are JavaScript, type-checked with relaxed settings (`src/app/tsconfig.json`: implicit `any` and null checks are off); their three lint warnings (unused variables) are left as found. The adapters, the platform types, `src/ai-shared`, `src/domain` and the tests are TypeScript with the strict settings (`npm run typecheck` checks both).
