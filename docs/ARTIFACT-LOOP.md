# The artifact loop

The practice page started as a Claude artifact and was polished there through comments, Claude's own `db` (answers, favourites, skips, debates, check-lab runs) and `sample` (tutor, answer checking). This repo keeps that way of working. The artifact is a build target of the repo, not a separate copy.

```
 src/app, src/artifact, src/data
          │
          │  npm run build:artifact
          ▼
 dist/artifact/index.html ──publish (Artifact tool, same url)──► live artifact
          ▲                                                          │
          │   npm run artifact:import -- <page>  (only if the page   │
          └──── was changed outside the repo)  ◄─────────────────────┘
```

## What stays the same

- The live artifact keeps its URL, its `db` and `sample` capabilities, its viewers and its comment thread. Publishing a repo build to that URL is an ordinary republish; the data lives in the artifact's database, not in the page.
- Nothing in the page's code is specific to the repo. It asks `window.claude.use("db")` and `use("sample")`, as before. The two seams (`window.__riglam.fetchData()` for the term data, the test hook block at the end of `app.js`) are described in [ARCHITECTURE.md](ARCHITECTURE.md).
- Collection names and document shapes are part of the stored data. Do not rename a collection or change a shape without a migration.

## Starting point: version 63

`legacy/relations-drill.v63.html` is the artifact page (version 63) that `src/app` was imported from, and `npm run artifact:drift` reports no drift against it. From here on the source of truth is `src/app`, not the published page.

If the published page was changed outside the repo, bring it in before editing anything else:

```sh
# 1. save the live page as a file (read it with the Artifact tool, action "read", then drop the document skeleton the
#    tool adds around the page: everything before <title> and the closing </body></html>)
# 2. see whether the repo differs from it
npm run artifact:drift -- /path/to/page.html
# 3. if it does, import it, refresh tests/legacy (docs/TESTING.md), check the diff and run the tests
npm run artifact:import -- /path/to/page.html
git diff src/
npm test
```

`artifact:import` splits the page into `src/artifact/head.html`, `src/app/app.css`, `src/app/markup.html` and `src/app/app.js`, applies the two seams, and keeps the repo's own test hook block. It refuses a page that is not shaped like the current one (one `<style>`, one `<script>` holding one IIFE, one `fetch("drill-data.json")`) and says what is missing. New exports needed by a test go into the hook block in `src/app/app.js`.

## The iteration loop

1. Work on a branch of this repo: `git switch -c <branch>`. Never edit the published page by hand; edit `src/app/*` (and the term data through `npm run data:import`, see [DATA.md](DATA.md), when it changes).
2. Build the artifact: `npm run build:artifact`. It merges the encrypted definitions and notes into the page, so it needs the data key (`RIGLAM_DATA_KEY` or `.data-key`, [DATA.md](DATA.md)) and stops without it. For a trial that must not touch the real page, build with another title (`ARTIFACT_TITLE="Riglam artifact build (test)" npm run build:artifact`) and publish it as a new artifact.
3. Test: the targeted legacy files while iterating (`node tests/legacy/test62.js` after a build, or `npx playwright test --project=legacy -g test62`), `npm test` before publishing. The PWA specs catch differences between the two builds.
4. Publish `dist/artifact/index.html` with the Artifact tool, passing the live artifact's `url` and leaving `capabilities` out (the stored `db` and `sample` declaration is kept). The file is already the shape the tool wants: `<title>` in the first 8 KB, Google Fonts as the only external host, no service worker, about 0.5 MB.
5. Note the artifact's version id in the commit message or the PR description (for example "published as artifact version 1791790000-abcd"), commit with a conventional message (`fix:`, `feat:`, `style:`; see [RELEASING.md](RELEASING.md)) and open or update a pull request.
6. Comments on the artifact reach the session that watches it. The answer to a comment is a commit plus a republish.

The pull request is how the work is kept. A republish without a commit is lost the next time someone builds from the repo, so the order is always: change the source, build, publish, commit.

## Keeping the PWA and the artifact in step

Both builds come from the same files, so a change in `src/app` reaches both. Things that exist only in the artifact (Claude's `sample`) are hidden by the page when `sample` is `null`, so the PWA shows no empty tutor. When a change depends on `sample`, the legacy suite covers it with the mocked `sample`; the PWA specs check that the PWA hides it.
