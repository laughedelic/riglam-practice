# The term data

The term data has two tiers. Only the definitions, and the commentary that quotes sources, follow third-party wording. Everything else is facts, short terms or text written in this project.

| Tier | What | Where | In the repository | In the PWA |
|---|---|---|---|---|
| Open | terms (name, Wylie, Sanskrit, aliases, chapter), Russian and Chinese terms, relations and classification, everyday items, categories | `src/data/drill-data.json` | plain JSON, one term per line so that diffs read | plain, precached |
| Course: definitions | `d` (English) and `d_ru` (Russian) of each term | the server's database (`course_data`), and `data-private/definitions.json` on a machine that works with the data | not included (git-ignored folder) | fetched from the server with the Magic Key, then kept on the device |
| Course: notes | `note` of each term and the group `notes`: commentary read only by the Claude tutor | the server's database, and `data-private/notes.json` | not included | not included, and the server never sends them out |
| Course: examples | the reference examples: the knowledge base's example notes with their classes, level (1 to 4), kind and confirmation (below) | the server's database (rows `examples` and `examples_device`), and `data-private/examples.json` and `examples-device.json` | not included | the device part, fetched in the background with the Magic Key, then kept on the device |

The artifact build carries all of it, because the artifact is private to its owner and its tutor reads the notes; it reads `data-private/`. That includes the device part of the reference examples, when `data-private/` has them (about 240 KB with the real ones, against the page budget of 1 MiB in `tests/unit/artifact-build.test.ts`). The tutor Worker ([SERVER.md](SERVER.md)) reads the notes from its database, so the tutor sees them and a browser never receives them.

## The Magic Key

The Magic Key is a few random words joined by dashes, for example `lotus-river-candle-stone` (four words from the EFF long word list: about 52 bits). It is typed or dictated with spaces, in any case, or arrives in the study group's link, after the `#`: `https://<host>/#k=lotus-river-candle-stone` (`src/ai/magic-key.ts` reads all of these the same way). It opens two things on the server: the definitions (`GET /api/course`) and the tutor (`POST /api/tutor`). A request proves that it has the key without sending it: `HMAC-SHA256(key, "riglam/tutor-proof/1:" + device id)` ([SERVER.md](SERVER.md)).

Because the key is words, guessing is slowed by the server: a caller (a hash of its address, not stored) gets 30 wrong proofs per hour, after which the answer is "try later" until the next hour. A wrong guess costs nothing but the count.

| Where the key is | Why |
|---|---|
| The study group's link, after the `#` | Browsers never send the part after `#` to a server. The app takes the key out of the address at once and keeps it on the device (`localStorage`, `riglam.magicKey`), together with the definitions it fetched, so the definitions work offline and on later visits without the link. |
| The Worker's secret `RIGLAM_DATA_KEY` (`wrangler secret put`) | The server checks proofs against it. Without it, or with a value that is not the words of a Magic Key (the 43-character key of earlier versions), the tutor reports itself off and `/api/course` answers "not granted". |

The key never goes into the repository, a commit or pull request text, a comment, a log or the project's memory. `tests/unit/data-files.test.ts` fails if a tracked file holds a definition or a note in the clear, or, when the key is in the environment, the key itself.

## Accounts carry the key

A person with an account (docs/SERVER.md, "Accounts and sync") does not need to keep the words: a device that has the key makes its account carry it, and a device that signs in to that account gets it. After the key is changed, the devices of such accounts take the new one by themselves. Anyone who had the old key and made an account carries the new key too, so before changing the key because of a leak, look at every account that carries it (`has_key = 1` in `users`), not only those made since the leak (an older account that showed the leaked key afterwards carries it too), and delete the ones that are not the group's.

## The reference examples

The knowledge base keeps example notes: a thing, a representation, a relation, a negation, a combination of two things or a statement, each with the classes (terms) it is an instance of and is not, whether it exists, a level from 1 (a plain thing) to 4, how well the sources confirm it (`confirmed` in two or more, `textbook`, `commentator`), and sometimes a one-sentence gloss of why it is a good example. Its exporter writes them as one JSON file, `{format: "riglam-examples", version: 2, sources: {id: {tier}}, items: [...]}`, whose items have the keys `n` (name), `al` (aliases), `cls`, `not`, `ne`, `lv`, `sc`, `k` (kind), `f` (form), `cf` (confirmation), `cn`, `inc`, `bg`, `gloss`, and, for the server only, `src` (the places in the sources), `web`, `base` and `mem` (the members of a combination). The types are in `src/ai-shared/examples.ts`.

`npm run data:import-examples -- <examples.json>` checks the file against the open data (every class is a term, every item has a level and a source, no two have the same name) and writes it to `data-private/examples.json`, together with the device part, `examples-device.json`, which `src/data/examples.js` makes from it: the same items without `src`, `web`, `base` and `mem`, without aliases in Chinese or Tibetan script, with `s`, the ids of the sources an item is in (ids of the `course` tier, the booklets, left out), and with the `built` stamp of the open data it was checked against. `data:check` and `data:publish` refuse a device part that was not made from the full one for this open data. The examples are optional: without them `data:publish` loads the definitions and notes only, and the app has no examples.

On the server, the tutor's lookup of an example (`classify_example`) falls back to the full part when the practice list does not have the thing, and a device with the Magic Key gets the device part from `GET /api/course/examples` (docs/SERVER.md). A device asks for it only after the definitions' check found the key fitting, in the background, and keeps it under `riglam.examples` with its own version; forgetting the key forgets it too. `placeByClass` (`src/domain/reference.ts`) places an example in a category by its classes alone: yes when the category's term is in its chain, no by an exclusion the data records or a class it is not, otherwise nothing.

The page reads the device part into `state.EX` and uses it in two places. A definition card shows up to three examples of the term (`examplesFor`: the term's own first, then the plainest and the better confirmed), each with its level and how well it is confirmed, and no source named. The reference of a cell of a practice pair (the example shown for what the learner left empty or got wrong) may be one of them too (`witnessesOf` in `src/domain/reference.ts`, the `more` of `pairOf`): a confirmed or textbook example, of a kind a cell takes (a thing or a representation; a relation or a negation when level 3 or 4 is on; never a combination or a statement), without an expert background, from the levels switched on in the Options row "Examples" (a switch for each of the levels 1 to 4 with its explanation, any mix, at least one on, `rd-exlevels`; level 1 alone on a new device; `LEVEL_INFO` in `src/app/core/examples.js`), whose cell `placeByClass` proves for both categories. The practice list still decides the relation and which cells are empty, so an example only joins a cell the list fills, and an example the list has under the same name is the list's.

## Where the data lives

`data-private/` (git-ignored) holds `definitions.json` and `notes.json` (and, where the examples were imported, `examples.json` and `examples-device.json`) on every machine that builds the artifact, runs the full tests or changes the data. The server holds the same two texts in the table `course_data` (`worker/migrations/0003_course_data.sql`), loaded by `npm run data:publish`. The Worker reads them at most once a minute, so new data needs no deploy.

Without `data-private/`: `npm run build:pwa`, the unit tests that do not need it, and the PWA specs that do not need it work. `npm run build:artifact` stops with a message, because an artifact built without definitions must never replace the live one.

## What a reader sees

- With the key (from the link, or kept from an earlier visit): the terms in the Terms panel and in the tutor's notes that have a definition are dot-underlined, and a tap opens the definition in place (a term's higher categories in its card open the same way). The first unlock needs the network; the definitions are then kept on the device, and each later visit asks the server in the background whether they changed.
- Without it: the terms, translations and relations work and nothing greets the reader with a prompt. The Terms panel has no underlines, only one note and a button that opens the prompt. Explain shows grayed when the server has a tutor, and a tap opens the prompt too, as does the Magic Key row in Options. The prompt (`src/pwa/unlock.ts`) takes the words or the whole link and opens by itself only when a link carries a key that does not fit. A key that does not fit is refused and not kept. A key that fits is taken into the running page with no reload (`platform.onKey`): the definitions and the tutor open, and the pair and answer on the screen stay; Explain, if that is what opened the prompt, goes on to ask its question.
- A key the server stops accepting (after a change of the secret) is forgotten, together with the kept definitions, on the next visit with a connection; the visit after that opens the prompt once, with a message that the key was changed.
- An app added to the iPhone home screen has storage of its own, separate from Safari, and a link cannot be opened inside it. Its dialog is the way in: type or paste the key there once.
- If the browser's storage is cleared, the app asks again.

## Working with the data

```sh
npm run data:key                      # print a new Magic Key (four random words)
npm run data:import -- full.json      # split a knowledge-base export into src/data/drill-data.json and data-private/
npm run data:import-examples -- examples.json  # check the knowledge base's reference examples and write them, and the device part, into data-private/
npm run data:export -- full.json      # the full data, definitions and notes put back
npm run data:check                    # check that the open file holds no definition or note and data-private/ matches it (every term needs a definition, the examples fit the open data; publish makes the same check)
npm run data:publish                  # load data-private/ into the production database, the examples too when they are there (wrangler; --config <file> for another database)
npm run data:sql -- out.sql           # the statements publish runs, to load by other means
npm run data:fixture                  # write made-up definitions, notes and examples into data-private/ (refuses to overwrite real ones; --replace does)
```

To refresh the data from the knowledge base (which lives outside this repository), export the full file there and run `npm run data:import -- <that file>`, then `npm run data:publish`. Files that did not change are not rewritten, and a part that did not change keeps its version on the server. Never commit a file with definitions in it; `npm run test:unit` catches it.

CI never has the real course data. Before the build it runs `npm run data:fixture`, which writes invented definitions and notes for every term of the open data (`scripts/lib/made-up-course.mjs`): the same shape and about the same lengths as the real ones, Russian text included, a few terms without a Russian definition or with the booklet's "no definition" placeholder, notes on a quarter of the terms and on a third of the categories, and 80 invented examples whose classes are terms picked at random (with every field of the format, so that what the device part leaves out is tested). So the artifact build, the layout and legacy specs and the server tests run in full, and a log or a test report can show nothing that is not made up. The tests that read the real text (`the real course data` in `tests/worker/kit.test.ts`, the leak scans in `tests/unit/data-files.test.ts`, which also fail when a tracked file holds a gloss or more than five names of examples) pass on the made-up text too, and are worth running with the real data before publishing it (`npm run check` on a machine that has `data-private/`).

To change the key (a leak, or someone who should no longer open new versions): `npm run data:key`, `wrangler secret put RIGLAM_DATA_KEY`, hand out the new words or link. Devices that have the old key lose access on their next visit with a connection and ask for the new one, unless they belong to an account that carries the key. This does not take back copies already fetched.

## What this does and does not do

It keeps the definitions out of search engines, link previews, the host's files, a scrape of the site and the repository. It does not stop someone who holds the key from copying what they can read, and it does not hide the open tier, which is meant to be shareable.
