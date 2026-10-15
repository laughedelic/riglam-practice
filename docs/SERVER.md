# The server

The app is static files plus one small Worker that answers `/api/*`. The Worker is what lets the installed app use the AI tutor without anyone's Claude account: it holds the model API key, checks who is asking, keeps each device and the whole app within a daily budget, and streams the answer back. Everything else the app does stays on the device.

Hosting is the same Cloudflare Worker that serves the static files (`wrangler.jsonc`, [DEPLOY.md](DEPLOY.md)). With `assets.run_worker_first: ["/api/*"]` only requests under `/api/` run the Worker; every other request is answered from `dist/pwa` without it.

## Layout

```
worker/index.ts         the Worker entry: createApp(...).fetch
worker/app.ts           routes, origin and proof checks, the budget, the server-sent stream (Hono)
worker/tutor.ts         one question: the model calls through the Anthropic SDK, the tool loop, the cost
worker/budget.ts        the spend counters in D1: reserve, settle, the kill switch, pruning
worker/prices.ts        price per million tokens for each model; unknown models are charged at the highest rate
worker/config.ts        settings from variables, with defaults
worker/kit.ts           what the tutor knows, made from the term data: standing instructions, lookup tools, the notes
worker/bundled.ts       the open data file as the script carries it (only worker/index.ts imports it)
worker/course.ts        the course data as two rows of the course_data table
worker/magic.ts         the Magic Key from the secret, and the count of wrong proofs per caller and hour
worker/migrations/      D1 schema (applied with wrangler, see below)
src/ai/protocol.ts      the contract between page and server (shared by both): paths, headers, request, events, error codes
src/ai/proof.ts         the access proof (shared by both)
src/ai/magic-key.ts     reading the Magic Key from typed words or a link (shared by both)
src/ai-shared/          the standing instructions, the lookup tools and the card, as pure functions of the term data (shared with the page)
tests/worker/           Vitest tests with stand-ins for D1 and the model API
```

## Routes

| Route | What it does |
|---|---|
| `GET /api/health` | `{"ok":true,"tutor":"on"\|"off"}`. `off` when the database, a secret or the kill switch says so. No sign-in. |
| `GET /api/course` | The definitions `{version, definitions}` to a request with a valid proof (headers `x-riglam-device`, `x-riglam-proof`); `?have=<version>` answers `{version, unchanged: true}` when current. 401 `not_granted` for a wrong proof, 429 `rate_limited` with `resetsAt` after 30 wrong proofs from one caller in an hour, 503 `unavailable` when the table is empty. |
| `POST /api/tutor` | One tutor question. Body `{kind: "chat" \| "explain", cats: [category ids], turns: [{role, content}]}` (`src/ai/protocol.ts`). The answer is `text/event-stream` of `delta` (a piece of text), `done` (`truncated` says the model ran out of room) and `error` (`code`, `message`). Requests that cannot be served are plain JSON errors with a status: 400, 401, 403 (another site's `Origin`), 413, 429, 503. |

The request carries only what the learner typed and the page's own state (the card of the pair and the conversation). The standing instructions, the lookup tools and the notes ("fine points") are on the server; the notes never reach a browser.

**The kit.** `worker/kit.ts` makes the tutor's knowledge per Worker instance: it reads the two rows of the `course_data` table (`worker/course.ts`), puts them together with `drill-data.json` (bundled into the script) as the knowledge base exports them ([DATA.md](DATA.md)), and builds the instructions and the two lookup tools from `src/ai-shared`, the code the page uses too. An instance looks at the table again after a minute, so `npm run data:publish` gives the tutor new data with no deploy. Without the rows the tutor is off.

**The definitions.** `GET /api/course` (`worker/app.ts`) returns the definitions to a request whose proof fits the Magic Key (`worker/magic.ts`), with the version they were loaded at; `?have=<version>` is answered with `{unchanged: true}` when the copy is current. Wrong proofs are counted per caller and hour (`guesses` table, 30 an hour); past that the answer is 429 with `resetsAt`, and the proof is not even looked at. The notes are never sent.

Error codes the page can see: `rate_limited` (the device's or everybody's budget for the day is used, or the model is busy), `not_granted` (the proof does not match), `prompt_too_large`, `bad_request`, `refused` (the model declined), `unavailable` (the tutor is off or failed). The details of a failure go to the log, never into the response.

## How the app uses it

The installed app (`src/pwa/tutor.ts`, the `tutor` capability of the platform, [ARCHITECTURE.md](ARCHITECTURE.md)) offers the tutor, Explain and the follow-up chat only when two things hold: this device has the Magic Key, and `GET /api/health` answers `tutor: "on"` within a few seconds. Otherwise the page hides them, as it does without a network. A question sends the card of the pair (without the instructions and the notes, which are the server's) and the conversation; the answer is shown as it arrives. A refusal reaches the person in plain words: the day's budget is used (it says whether it was this device's own or everybody's, and when the tutor is available again in the person's own time; the rest of the app keeps working), no connection, the conversation is too long, or (when the proof is refused) the tutor goes away until the next visit.

To try it locally, run the Worker and the app together with `npx wrangler dev` after `npm run build:pwa`: apply the migration to the local database (`npx wrangler d1 migrations apply riglam-practice --local`) and put `ANTHROPIC_API_KEY` and `RIGLAM_DATA_KEY` (any Magic Key) in a file named `.dev.vars` (git-ignored), and load the course data with `npm run data:publish -- --local`. `npm run dev` alone has no server, so the tutor is off there.

## Who may ask

The app is open to anyone with the link, but the tutor costs money, so a request must prove that its sender has the Magic Key (the words in the shared link, [DATA.md](DATA.md)). The page makes a random device id once and sends it with a proof: `HMAC-SHA256(key, "riglam/tutor-proof/1:" + device id)`, base64url (`src/ai/proof.ts`). The Worker holds the same key as a secret, recomputes the proof and compares in constant time. The key itself is never sent. A request with another `Origin` than the app's own is refused.

The device id is not a secret and proves nothing alone; anyone with the key can invent ids. The per-device limit therefore stops accidents and one heavy user. The global limit and the cap on the API account are the real limits.

## Budgets

Money is counted in micro-dollars (millionths of a dollar) per UTC day, in D1:

1. Before the model is called, the Worker holds back an assumed cost (`RESERVE_USD`) against the global counter and the device's counter, each in one conditional `UPDATE ... WHERE micro + hold <= cap`. Two questions that arrive together cannot both pass a budget that has room for one. If either has no room the answer is `429` with `retry-after` (the seconds to the next UTC midnight), and the error says whose budget it was (`scope`: `device` or `global`) and when it starts again (`resetsAt`, the next UTC midnight); nothing is held.
2. When the question ends (answered, cut off, refused, failed, or the page went away), the held amount is replaced by the real cost, from the token counts the API reports. A question that ends in an error is charged for what the model had used.
3. One line per question goes to `usage_log`: time, device id, kind, model, rounds, token counts, cost, outcome. No text of any question or answer is stored.

If the Worker is stopped between steps 1 and 2 the hold stays, so a lost settlement can only over-charge the budget, never under-charge it.

The hold is an average, not the worst case: a question with several tool rounds can cost more than `RESERVE_USD`, so questions that run at the same moment can together overshoot a budget by up to a few times the hold per question (for the defaults, a device sending many questions at once could pass its daily budget). The daily budgets are therefore soft counters. The hard limit is the spend limit on the Anthropic workspace (step 1 of "Setting up your own"); keep it set, and raise `RESERVE_USD` if you want the counters tighter.

Variables (`wrangler.jsonc`, `vars`; defaults in `worker/config.ts`; a value that is not a sensible number falls back to the default):

| Variable | Default | Meaning |
|---|---|---|
| `TUTOR_MODEL` | `claude-sonnet-5-5` | the model; a name not in `worker/prices.ts` is charged at the highest rate |
| `TUTOR_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max` |
| `TUTOR_MAX_TOKENS` | `6000` | output limit per model call |
| `TUTOR_MAX_ROUNDS` | `4` | model calls per question (tool rounds); on the last one tools are switched off so the model must answer |
| `DEVICE_DAILY_BUDGET_USD` | `1.00` | per device and UTC day |
| `GLOBAL_DAILY_BUDGET_USD` | `8` | all devices together |
| `RESERVE_USD` | `0.05` | the hold per question |

Prices are in `worker/prices.ts`, copied from Anthropic's pricing page; update them when the page changes or when a model is added.

## The model calls

`worker/tutor.ts` calls the Messages API through the official SDK (`@anthropic-ai/sdk`) with streaming. The model does its own thinking depth (adaptive; the `thinking` parameter is left out) at the configured effort. Automatic prompt caching (a top-level `cache_control`) makes a follow-up question re-read the earlier turns at the cache price. The Worker runs the lookup tools itself and sends the results back to the model; a failing tool is reported to the model as an error result, not to the page. Server-side fallbacks to another model are not enabled: when the model refuses or is unavailable the page gets an error and nothing is retried on a different model.

## Setting up your own

Nothing here is needed to build or test the app; without the database the tutor is simply off (`/api/health` says so).

1. Create a workspace, a spend limit and an API key in the Anthropic Console. A spend limit on the workspace is a cap that does not depend on this code.
2. Create the database and apply the schema, from a checkout, signed in with `npx wrangler login`:
   ```sh
   npx wrangler d1 create riglam-practice
   ```
   Put the `database_id` it prints into the `d1_databases` entry of `wrangler.jsonc` (binding `DB`, `migrations_dir` `worker/migrations`), then:
   ```sh
   npx wrangler d1 migrations apply riglam-practice --remote
   ```
   Apply it again after any pull request that adds a file to `worker/migrations/`.
3. Store the two secrets on the Worker (the commands ask for the value at a prompt):
   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put RIGLAM_DATA_KEY     # the Magic Key: the words in the shared link
   ```
   Secrets belong to the Worker, so previews use them too. Then load the course data into the database: `npm run data:publish` (needs `data-private/`, [DATA.md](DATA.md)).
4. Deploy as usual. Check `GET /api/health`.

**Kill switch.** In the Cloudflare dashboard (D1, the database, Console): `INSERT OR REPLACE INTO settings (key, value) VALUES ('tutor', 'off');` stops every tutor request at once; deleting the row (or any value but `off`) turns it on again. Archiving the API key in the Console or setting the workspace limit to zero also stops all spending.

**Privacy.** The Worker keeps spend counters and the usage log above, keyed by the random device id, and no accounts. Workers Logs are on for the lines the Worker writes itself (error names and statuses, never question text); per-request invocation logs are off.

## Tests

`tests/worker/` runs under plain Vitest (`npm run test:unit`) with stand-ins:

- D1 is a SQLite in memory (`node:sqlite`) with the real migrations applied, so the SQL that counts money is the SQL that runs in production.
- The model API is a `fetch` that answers with scripted server-sent events, so the real SDK client parses them (text, tool calls, `max_tokens`, refusals, HTTP errors, a call that hangs until the page goes away).
- The kit is made from a few invented terms in a fake database; the last test block runs on the real course data when `data-private/` is there (as in CI, [DATA.md](DATA.md)) and is skipped otherwise.

They cover the kit (the tools, the notes, a category id that is not the data's own, the wrong key, no text in the log), the proof, the settings, the prices, the counters (including simultaneous questions), every refusal path, a plain answer with the exact model request, tool rounds and their failure, the last-round rule, every failure of the model call, and the page going away.

What they cannot show is the Workers runtime itself. To try the Worker in `wrangler dev`, give it a local D1 binding (`wrangler d1 migrations apply <name> --local`), set `ANTHROPIC_BASE_URL` to a stand-in for the model API and use a throwaway Magic Key. Note that `wrangler dev`'s local proxy does not pass on a client that hangs up, so a page going away mid-answer can only be seen in the unit tests or on a deployed Worker (the `outcome` column of `usage_log` shows `aborted`).
