# The artifact loop

The practice page started as a Claude artifact and was polished there through comments, Claude's own `db` (answers, favorites, skips, debates, flags) and `sample` (tutor, answer checking). This repo keeps that way of working. The artifact is a build target of the repo, not a separate copy.

```
 src/app, src/artifact, src/data
          │
          │  npm run build:artifact
          ▼
 dist/artifact/index.html ──publish (Artifact tool, same url)──► live artifact
          ▲                                                          │
          └────── npm run artifact:verify -- <page>  ◄───────────────┘
                  (is the published page this build?)
```

## What stays the same

- The live artifact keeps its URL, its `db` and `sample` capabilities, its viewers and its comment thread. Publishing a repo build to that URL is an ordinary republish; the data lives in the artifact's database, not in the page.
- Nothing in the page's code is specific to the repo. The artifact build starts the page with a platform that passes `window.claude.use("db")` and `use("sample")` through, as before. The seams (the platform, the test hook block at the end of `app.js`) are described in [ARCHITECTURE.md](ARCHITECTURE.md).
- Collection names and document shapes are part of the stored data. Do not rename a collection or change a shape without a migration.

## Source of truth

The source of truth is `src/`, not the published page. The page is a build output; the first version published from a build of this repo was 64. Never edit the published page by hand.

To check that the live page is a build of the current source (for example before a republish, or after someone else may have touched it):

```sh
# 1. save the live page as a file (read it with the Artifact tool, action "read")
# 2. build and compare: the head, the style, the markup and the script are compared separately
npm run build:artifact
npm run artifact:verify -- /path/to/page.html
```

The comment with the commit and the document skeleton the tool adds around a page (doctype, `html`, `head`, `meta` and `body` tags, the frame's own style) are ignored, so a build of another commit with the same sources is "the same". Anything else outside the page, such as an element before the title or text after the script, is reported as a difference in `wrapper`. When the pages differ, the command prints where each part first differs. A change made to the published page outside the repo is carried into `src/` by hand (the diff shows where), and tests and a rebuild come before the next publish.

## The iteration loop

1. Work on a branch of this repo: `git switch -c <branch>`. Never edit the published page by hand; edit `src/app/*` (and the term data through `npm run data:import`, see [DATA.md](DATA.md), when it changes).
2. Build the artifact: `npm run build:artifact`. It merges the definitions and notes into the page, so it needs the course data (`data-private/`, [DATA.md](DATA.md)) and stops without it. For a trial that must not touch the real page, build with another title (`ARTIFACT_TITLE="Riglam artifact build (test)" npm run build:artifact`) and publish it as a new artifact.
3. Test: `npm run check:fast` while iterating, the targeted specs after a build (`npx playwright test --project=pwa-desktop path-take`), `npm run check` before publishing. The PWA specs catch differences between the two builds.
4. Publish `dist/artifact/index.html` with the Artifact tool, passing the live artifact's `url` and leaving `capabilities` out (the stored `db` and `sample` declaration is kept). The file is already the shape the tool wants: `<title>` in the first 8 KB, Google Fonts as the only external host, no service worker, about 0.5 MB.
5. Note the artifact's version id in the commit message or the PR description (for example "published as artifact version 1791790000-abcd"), commit with a conventional message (`fix:`, `feat:`, `style:`; see [RELEASING.md](RELEASING.md)) and open or update a pull request.
6. Comments on the artifact reach the session that watches it. The answer to a comment is a commit plus a republish.

The pull request is how the work is kept. A republish without a commit is lost the next time someone builds from the repo, so the order is always: change the source, build, publish, commit.

## Keeping the PWA and the artifact in step

Both builds come from the same files, so a change in `src/app` reaches both. Things that exist only in the artifact (Claude's `sample`) are hidden by the page when `sample` is `null`, so the PWA shows no empty tutor. When a change depends on `sample`, the parity spec and `auto-explain-artifact.spec.js` cover it in the artifact build with a mocked `sample`; the PWA specs check that the PWA hides it.
