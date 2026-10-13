# The term data

The term data has two tiers. Only the definitions, and the commentary that quotes sources, follow third-party wording. Everything else is facts, short terms or text written in this project.

| Tier | What | File | In the repository | In the PWA |
|---|---|---|---|---|
| Open | terms (name, Wylie, Sanskrit, aliases, chapter), Russian and Chinese terms, relations and classification, everyday items, categories | `src/data/drill-data.json` | plain JSON, one term per line so that diffs read | plain, precached |
| Course: definitions | `d` (English) and `d_ru` (Russian) of each term | `src/data/course-definitions.enc` | encrypted | encrypted, precached; read with the key |
| Course: notes | `note` of each term and the group `notes`: commentary read only by the Claude tutor and the check lab | `src/data/course-notes.enc` | encrypted | not included |

The artifact build carries all of it, because the artifact is private to its owner and its tutor and check lab read the notes. The PWA carries the open data and the encrypted definitions.

## The key

One key, `RIGLAM_DATA_KEY`: 32 random bytes as 43 characters of base64url. It opens both encrypted files (AES-256-GCM; the format is in `src/data/course.js`, which the browser, the scripts and the tests all use).

| Where the key is | Why |
|---|---|
| The study group's link, after the `#`: `https://<host>/#k=<key>` | Browsers never send the part after `#` to a server, so the host only ever holds ciphertext. The app takes the key out of the address at once and keeps it on the device, so definitions work offline and on later visits without the link. |
| GitHub Actions secret `RIGLAM_DATA_KEY` (also as a Dependabot secret, which Dependabot runs read instead of the Actions secrets) | The CI jobs that build the artifact (`static` and each `browser` job) need it for the artifact build and the tests that read the definitions. CI stops with a message when it is missing. The PWA build and its deploy need no key. |
| The Claude cloud environment's secrets | Sessions that build the artifact, run the full tests or change the data. |
| `.data-key` (git-ignored) or the environment variable, on a machine that builds the artifact or edits the data | The scripts read `RIGLAM_DATA_KEY`, then `.data-key`. |

The key never goes into the repository, a commit or pull request text, a comment, a log or the project's memory. `tests/unit/data-files.test.mjs` fails if a tracked file holds the key or any definition or note in the clear.

Without the key: `npm run build:pwa`, the unit tests that do not need it, and the PWA specs that do not need it work. `npm run build:artifact` stops with a message, because an artifact built without definitions must never replace the live one.

## What a reader sees

- With the key (from the link, or kept from an earlier visit): the definitions are in the Terms panels as before.
- Without it: the terms, translations and relations work, every definition reads "Locked: open your study group's link to read the definitions.", and a dialog (`src/pwa/unlock.ts`) explains how to open them. The dialog takes the whole link or just the key, and "Not now" hides it until the tab is closed. A key that does not fit is refused and not kept.
- An app added to the iPhone home screen has storage of its own, separate from Safari, and a link cannot be opened inside it. Its dialog is the way in: paste the link or the key there once.
- If the browser's storage is cleared, the app asks again.

## Working with the data

```sh
npm run data:key                      # print a new key
npm run data:import -- full.json      # split a knowledge-base export into the three files (needs the key)
npm run data:export -- full.json      # the full data, definitions and notes put back (needs the key)
npm run data:check                    # decrypt the files and check that the open file holds no definition or note
npm run data:rekey                    # re-encrypt under a new key, save it in .data-key, print it
```

To refresh the data from the knowledge base (which lives outside this repository), export the full file there and run `npm run data:import -- <that file>`. Files that did not change are not rewritten. Never commit a file with definitions in it; `npm run test:unit` catches it.

To rotate the key (a leak, or someone who should no longer open new versions): `npm run data:rekey`, replace the secrets, hand out new links. This does not take back copies already decrypted, or old ciphertext in git history together with the old key.

## What this does and does not do

It keeps the definitions out of search engines, link previews, the host's files, a scrape of the site and the repository. It does not stop someone who holds the key from copying what they can read, and it does not hide the open tier, which is meant to be shareable.
