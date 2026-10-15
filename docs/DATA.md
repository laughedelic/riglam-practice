# The term data

The term data has two tiers. Only the definitions, and the commentary that quotes sources, follow third-party wording. Everything else is facts, short terms or text written in this project.

| Tier | What | Where | In the repository | In the PWA |
|---|---|---|---|---|
| Open | terms (name, Wylie, Sanskrit, aliases, chapter), Russian and Chinese terms, relations and classification, everyday items, categories | `src/data/drill-data.json` | plain JSON, one term per line so that diffs read | plain, precached |
| Course: definitions | `d` (English) and `d_ru` (Russian) of each term | the server's database (`course_data`), and `data-private/definitions.json` on a machine that works with the data | not included (git-ignored folder) | fetched from the server with the Magic Key, then kept on the device |
| Course: notes | `note` of each term and the group `notes`: commentary read only by the Claude tutor and the check lab | the server's database, and `data-private/notes.json` | not included | not included, and the server never sends them out |

The artifact build carries all of it, because the artifact is private to its owner and its tutor and check lab read the notes; it reads `data-private/`. The tutor Worker ([SERVER.md](SERVER.md)) reads the notes from its database, so the tutor sees them and a browser never receives them.

## The Magic Key

The Magic Key is a few random words joined by dashes, for example `lotus-river-candle-stone` (four words from the EFF long word list: about 52 bits). It is typed or dictated with spaces, in any case, or arrives in the study group's link, after the `#`: `https://<host>/#k=lotus-river-candle-stone` (`src/ai/magic-key.ts` reads all of these the same way). It opens two things on the server: the definitions (`GET /api/course`) and the tutor (`POST /api/tutor`). A request proves that it has the key without sending it: `HMAC-SHA256(key, "riglam/tutor-proof/1:" + device id)` ([SERVER.md](SERVER.md)).

Because the key is words, guessing is slowed by the server: a caller (a hash of its address, not stored) gets 30 wrong proofs per hour, after which the answer is "try later" until the next hour. A wrong guess costs nothing but the count.

| Where the key is | Why |
|---|---|
| The study group's link, after the `#` | Browsers never send the part after `#` to a server. The app takes the key out of the address at once and keeps it on the device (`localStorage`, `riglam.magicKey`), together with the definitions it fetched, so the definitions work offline and on later visits without the link. |
| The Worker's secret `RIGLAM_DATA_KEY` (`wrangler secret put`) | The server checks proofs against it. Without it the tutor and `/api/course` answer "not granted". |

The key never goes into the repository, a commit or pull request text, a comment, a log or the project's memory. `tests/unit/data-files.test.ts` fails if a tracked file holds a definition or a note in the clear, or, when the key is in the environment, the key itself.

## Where the data lives

`data-private/` (git-ignored) holds `definitions.json` and `notes.json` on every machine that builds the artifact, runs the full tests or changes the data. The server holds the same two texts in the table `course_data` (`worker/migrations/0003_course_data.sql`), loaded by `npm run data:publish`. The Worker reads them at most once a minute, so new data needs no deploy.

Without `data-private/`: `npm run build:pwa`, the unit tests that do not need it, and the PWA specs that do not need it work. `npm run build:artifact` stops with a message, because an artifact built without definitions must never replace the live one.

## What a reader sees

- With the key (from the link, or kept from an earlier visit): the definitions are in the Terms panels. The first unlock needs the network; the definitions are then kept on the device, and each later visit asks the server in the background whether they changed.
- Without it: the terms, translations and relations work and nothing greets the reader with a prompt. A locked term in the Terms panel says in which booklet chapter to look it up, with one note and a button that opens the prompt. Explain shows grayed when the server has a tutor, and a tap opens the prompt too, as does the Magic Key row in Options. The prompt (`src/pwa/unlock.ts`) takes the words or the whole link and opens by itself only when a link carries a key that does not fit. A key that does not fit is refused and not kept.
- A key the server stops accepting (after a change of the secret) is forgotten, together with the kept definitions, on the next visit with a connection.
- An app added to the iPhone home screen has storage of its own, separate from Safari, and a link cannot be opened inside it. Its dialog is the way in: type or paste the key there once.
- If the browser's storage is cleared, the app asks again.

## Working with the data

```sh
npm run data:key                      # print a new Magic Key (four random words)
npm run data:import -- full.json      # split a knowledge-base export into src/data/drill-data.json and data-private/
npm run data:export -- full.json      # the full data, definitions and notes put back
npm run data:check                    # check that the open file holds no definition or note and data-private/ matches it
npm run data:publish                  # load data-private/ into the production database (wrangler; --config <file> for another database)
npm run data:sql -- out.sql           # the statements publish runs, to load by other means
npm run data:pack                     # data-private/ as one line of text (gzip, base64), for a CI secret
npm run data:unpack                   # the reverse, from RIGLAM_COURSE_DATA
```

To refresh the data from the knowledge base (which lives outside this repository), export the full file there and run `npm run data:import -- <that file>`, then `npm run data:publish`. Files that did not change are not rewritten, and a part that did not change keeps its version on the server. Never commit a file with definitions in it; `npm run test:unit` catches it.

CI gets the course data from the secret `RIGLAM_COURSE_DATA`, the output of `npm run data:pack` (about 15 KB), unpacked into `data-private/` before the build. It needs no Magic Key.

To change the key (a leak, or someone who should no longer open new versions): `npm run data:key`, `wrangler secret put RIGLAM_DATA_KEY`, hand out the new words or link. Devices that have the old key lose access on their next visit with a connection and ask for the new one. This does not take back copies already fetched.

## What this does and does not do

It keeps the definitions out of search engines, link previews, the host's files, a scrape of the site and the repository. It does not stop someone who holds the key from copying what they can read, and it does not hide the open tier, which is meant to be shareable.
