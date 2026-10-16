# The server

The app is static files plus one small Worker that answers `/api/*`. The Worker is what lets the installed app use the AI tutor without anyone's Claude account: it holds the model API key, checks who is asking, keeps each device and the whole app within a daily budget, and streams the answer back. Everything else the app does stays on the device, unless the person makes an optional account to keep their answers across devices (see "Accounts and sync" below).

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
worker/accounts.ts      optional accounts: the passkey ceremonies, sign-in state, deleting an account
worker/session.ts       session tokens and the cookie
worker/sync.ts          the server copy of a signed-in person's documents
worker/reports.ts       reports of learners' flags on the tutor's answers
worker/migrations/      D1 schema (applied with wrangler, see below)
src/ai/protocol.ts      the contract between page and server (shared by both): paths, headers, request, events, error codes
src/ai/proof.ts         the access proof (shared by both)
src/ai/magic-key.ts     reading the Magic Key from typed words or a link (shared by both)
src/account/            the device side: client, sync engine, outbox, passkey code (docs/ARCHITECTURE.md)
src/ai-shared/          the standing instructions, the lookup tools and the card, as pure functions of the term data (shared with the page)
src/account/protocol.ts the contract for accounts and sync (shared by both): paths, shapes, limits
src/report/protocol.ts  the contract for flag reports (shared by both): path, shapes, limits
src/pwa/reports.ts      the device side of flag reports: the request, the removals kept for a later try
tests/worker/           Vitest tests with stand-ins for D1 and the model API
```

## Routes

| Route | What it does |
|---|---|
| `GET /api/health` | `{"ok":true,"tutor":"on"\|"off","accounts":"on"\|"off"}`. `off` when the database, a secret or the kill switch says so. No sign-in. |
| `GET /api/course` | The definitions `{version, definitions}` to a request with a valid proof (headers `x-riglam-device`, `x-riglam-proof`); `?have=<version>` answers `{version, unchanged: true}` when current. 401 `not_granted` for a wrong proof, 429 `rate_limited` with `resetsAt` after 30 wrong proofs from one caller in an hour, 503 `unavailable` when the table is empty. |
| `POST /api/tutor` | One tutor question. Body `{kind: "chat" \| "explain", cats: [category ids], turns: [{role, content}]}` (`src/ai/protocol.ts`). The answer is `text/event-stream` of `delta` (a piece of text), `done` (`truncated` says the model ran out of room) and `error` (`code`, `message`). Requests that cannot be served are plain JSON errors with a status: 400, 401, 403 (another site's `Origin`), 413, 429, 503. |

| `POST /api/account/key`, `GET /api/account/key` | An account carries the Magic Key (needs a session and the access proof), and gives it to its signed-in devices. See "Accounts and sync". |
| `/api/account/...`, `POST /api/sync` | Optional accounts and the server copy of the documents; see "Accounts and sync". |
| `POST /api/flags` | Reports of flags: `{send?: [{id, flag, answer}], withdraw?: [id], status?: [id]}` with the same proof headers as the tutor; answers `{stored, withdrawn, status?}`. See "Flag reports" and "Reviewing flags". |

The request carries only what the learner typed and the page's own state (the card of the pair and the conversation). The standing instructions, the lookup tools and the notes ("fine points") are on the server; the notes never reach a browser.

**The kit.** `worker/kit.ts` makes the tutor's knowledge per Worker instance: it reads the two rows of the `course_data` table (`worker/course.ts`), puts them together with `drill-data.json` (bundled into the script) as the knowledge base exports them ([DATA.md](DATA.md)), and builds the instructions and the two lookup tools from `src/ai-shared`, the code the page uses too. An instance looks at the table again after a minute, so `npm run data:publish` gives the tutor new data with no deploy. Without the rows the tutor is off.

**The definitions.** `GET /api/course` (`worker/app.ts`) returns the definitions to a request whose proof fits the Magic Key (`worker/magic.ts`), with the version they were loaded at; `?have=<version>` is answered with `{unchanged: true}` when the copy is current. Wrong proofs are counted per caller and hour (`guesses` table, 30 an hour). A guess is taken in one statement before the proof is looked at, so requests that arrive together are held to the limit too, and a proof that fits gives it back; past the limit the answer is 429 with `resetsAt` and `scope: "caller"`, and the proof is not even looked at. If the guess cannot be taken (the database fails, or the Worker has no database binding) the proof is not looked at either and the answer is 503 `unavailable`, so a failing or missing counter does not let anyone try keys without limit. A caller whose proofs always fit leaves no row in the table. The tutor route answers a blocked caller the same way, so the page tells a wait from a refused key. The notes are never sent. The rows are loaded with `npm run data:publish` ([DATA.md](DATA.md)); until they are, `/api/course` answers `unavailable` and the tutor is off. The same answer is given when the definitions row is not a JSON object (a row written some other way; the Worker looks at it once per version before sending the stored text as it is).

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
| `REVIEW_MODELS` | `claude-sonnet-5-5,claude-opus-5-5` | the models that review flags, one review each (at most three; the rule needs two that agree) |
| `REVIEW_DAILY_BUDGET_USD` | `1.00` | all reviews of flags together per UTC day; the tutor's budgets are separate |
| `REVIEW_RESERVE_USD` | `0.10` | the hold per flag until its reviews have finished |
| `REVIEW_MAX_TOKENS` | `2500` | output limit per review call |
| `REVIEW_BATCH` | `5` | flags one scheduled pass reviews |

Prices are in `worker/prices.ts`, copied from Anthropic's pricing page; update them when the page changes or when a model is added.

## The model calls

`worker/tutor.ts` calls the Messages API through the official SDK (`@anthropic-ai/sdk`) with streaming. The model does its own thinking depth (adaptive; the `thinking` parameter is left out) at the configured effort. Automatic prompt caching (a top-level `cache_control`) makes a follow-up question re-read the earlier turns at the cache price. The Worker runs the lookup tools itself and sends the results back to the model; a failing tool is reported to the model as an error result, not to the page. Server-side fallbacks to another model are not enabled: when the model refuses or is unavailable the page gets an error and nothing is retried on a different model.

## Accounts and sync

Using the app needs no account, and everything it keeps stays on the device. A person who wants their answers, debates, favorites and skipped pairs on more than one device can make an account, which keeps a copy of those documents on the server. Export and import (Options, "Your data") remain the backup in every case.

**What an account is.** A random id, a name the person chose (the passkey manager shows it) and one or more passkeys: a public key each. There is no email address, no password and nothing else about the person. A passkey is made and used by the browser or the operating system (Face ID, a fingerprint, Windows Hello, a security key); the server only checks signatures. Passkeys that sync (iCloud Keychain, Google Password Manager, a password manager) work on the person's other devices; one that does not (a laptop's own) can be signed in with from a phone, and a second passkey can be added to an account.

A passkey belongs to the host name of the app (`riglam-practice.<account>.workers.dev`, or a custom domain). Moving the app to another host name leaves the passkeys behind: export on the old address and import on the new one.

**Signing in.** The ceremonies are WebAuthn, verified with `@simplewebauthn/server` (attestation `none`, discoverable credentials, user verification preferred but not required). Each ceremony starts with a challenge the server stores for five minutes and accepts once. Signing in gives the browser a random token in a cookie (`__Secure-riglam-session`, `HttpOnly; Secure; SameSite=Strict; Path=/api`); D1 keeps only its SHA-256, so a copy of the database cannot be used to sign in. A session lasts 60 days and is extended when it is used in its second half, in the browser's cookie too (the response of any account or sync request that extended it sets the cookie again). An account keeps at most 20 sessions: a sign-in first ends the account's sessions that are over and those beyond the newest 19, so repeated sign-ins do not pile up. The passkey's counter only goes up, also when two sign-ins finish in the other order. Requests that change anything must carry the app's own `Origin`.

**Sync.** `POST /api/sync` takes `{cursor, writes}` and answers `{cursor, changes, rejected, more}` (`src/account/protocol.ts`). The device sends the changes it made since last time, each as the document (or `null` for a deletion) and `t`, the time it made the change; the server answers with every document that changed on the server since `cursor`, in the order the changes were accepted. For one document the later `t` wins and a tie keeps the server's copy; the writes that lost come back in `rejected` with the server's copy, which the device takes. Deletions are rows without data, kept so that other devices learn of them. The server never merges inside a document and never reads what is in one beyond its size. Times more than five minutes ahead of the server's clock are cut back to that, so one wrong clock cannot make a copy nobody can beat.

**Limits.** Settings in `wrangler.jsonc` (`vars`; defaults in `worker/config.ts`):

| Variable | Default | Meaning |
|---|---|---|
| `SIGNUP` | `open` | who may make an account: `open`, `group` (only a caller with the access proof of the tutor, so only people who have the Magic Key) or `closed` (existing accounts still sign in) |
| `MAX_ACCOUNTS` | `300` | most accounts |
| `MAX_DOCS_PER_ACCOUNT` | `20000` | most documents one account holds (it also holds at most as many deletion marks again, twice this number of rows in all) |
| `DAILY_WRITES_PER_ACCOUNT` | `3000` | document changes one account may send per UTC day |
| `CEREMONIES_PER_DAY` | `2000` | sign-up, sign-in and add-a-passkey ceremonies that may be started per UTC day, all callers together (each writes a challenge row, and anyone can ask) |

A document is at most 256 KiB, a request at most 200 changes and 4 MiB (counted in bytes as the body arrives), and an answer at most 500 changes and 4 million characters of documents (the first change is always sent; `more` says there are further ones). The server's copies of the writes that lost are part of that text: the ones that do not fit are not sent in `rejected`; those the device has not received yet come with the changes anyway, and the others are given a new place in the sequence so that they come with them too. Deletion marks count as rows, and a mark older than 90 days (by the time of the change) is dropped when the account would otherwise be at its limit, so a device that was away longer than that may not learn of a deletion. At most 500 ceremonies are open at once, and an account holds at most ten passkeys. The limits on accounts, passkeys, open ceremonies and the day's changes are decided inside the statement that stores the row, so requests arriving together cannot pass them; the limit on documents is checked before the changes are stored, so a burst can pass it by about one request's worth per request in flight, which the daily limit bounds. These caps keep a stranger from filling the database or using up D1's daily write allowance, which the tutor's budget counters share.

**On the device.** Options shows an Account row when `/api/health` says accounts are on (or this device used one before, so that an offline start still queues changes). Signed out it offers "Create account" (a name for the passkey manager, then the browser's passkey dialog) and "Sign in" (the browser offers the passkeys it has for this app). Signed in it shows the name, the number of passkeys and where sync stands, with "Sync now", "Add a passkey", "Sign out" and "Delete account". Sign-out first sends what is waiting, and needs a connection because it ends the session on the server. Syncing runs on its own: a moment after a change, when the connection returns, when the page comes back into view and about once a minute while it is open. Settings (the `rd-*` keys in localStorage) are not synced; Export saves them. Every open tab notes its own writes and follows a sign-in, sign-out or switch made in another tab; a document the server sends is not stored over one the page wrote in the meantime, and a change whose note could not be stored is kept and noted again at the next round.

**Switches.** `INSERT OR REPLACE INTO settings (key, value) VALUES ('accounts', 'off');` stops sign-up, sign-in and sync at once (like the tutor's switch, in the D1 console); the app then behaves as if there were no accounts. `/api/health` shows `accounts: "off"` until the migration `0002_accounts.sql` has been applied.

**Carrying the Magic Key.** A signed-in device that has the Magic Key asks its account to carry it (`POST /api/account/key`, with the access proof; `users.has_key`, migration `0004_account_key.sql`). A device that signs in to an account that carries it, and has no key, takes the key from `GET /api/account/key` and starts again unlocked. The server answers that request with whatever key it holds now, so an account that carries the key keeps working after the key is changed, and a device whose key stopped fitting asks the account for the new one. An account that never showed the key is refused (`not_granted`).

**Deleting.** `DELETE /api/account` removes the account, its passkeys, sessions and documents in one batch, and the app offers it as "Delete account" in Options. The copy on each device is not touched.

## Flag reports

A learner can flag something Claude wrote (the explanation, a note on a cell, an answer in the chat) with a note on what is wrong. Where the server takes reports, a flag is also sent to whoever maintains the app, together with the stored answer it was made on (the pair, the learner's examples with their verdicts, Claude's explanation), so that it can be read with the whole exercise. Only a device that has the Magic Key can flag, so a device without it gets the same prompt as Explain; being signed in does not matter, and a report only records whether the sender was.

- `POST /api/flags` takes up to 5 reports and 50 removals. The headers are the tutor's (`x-riglam-device`, `x-riglam-proof`); a wrong proof counts against the caller like a wrong key does and is answered `not_granted`; after 30 wrong proofs from one caller in an hour the proof is not looked at and the answer is 429 `quota` with `retry-after`, even to a right one. A report is replaced by a later one with the same flag id; a device signed in to the account that sent a report can take it back, and an edit made on another device of the account replaces the first device's report.
- Limits per UTC day: 20 reports per device id, 60 per sender address (a short hash of it is kept, not the address), 1000 in all; 20 000 reports held. A report is at most 8 KB for the flag and 48 KB for the answer. An answer that is too large for that is left out and the flag is sent alone.
- A report is data from a device and is not trusted: the server stores it and reads nothing of it beyond its size, and whatever reads it later treats it as text, never as instructions.
- The page marks a flag as sent (`sentAt`) and shows "Sent to the maintainer" in Review (and then "Answered", "With the maintainer", "Fixed" or "Decided", with the reply as plain text under the flag, once the review has got that far; a reply can be flagged in turn, which sends a flag with `part: "reply"` that goes to the maintainer without a model review); a flag that could not be sent (offline, over a limit) is tried again at the next start and after the next flag. Removing a flag takes its report back, and the removal is kept on the device until the server has it.
- **Switch.** `INSERT OR REPLACE INTO settings (key, value) VALUES ('reports', 'off');` stops reports at once, and the page then keeps flags on the device. `/api/health` shows `reports: "off"` until the migration `0005_flag_reports.sql` has been applied.
- **Reading back.** `status: [ids]` (at most 50) is answered with `status: [{id, state, reply?, replyAt?}]` for those of the ids that this device sent or that an account it is signed in to sent: the state is `sent`, `answered`, `maintainer`, `fixed` or `decided`, and the reply is the text the sender reads under the flag. Nothing else of the review is sent back.
- **Privacy.** A report holds the flag, the answer, the app version, the random device id, the account id when the sender was signed in, and the hash of the address. No name or email. No route sends other people's reports back; the maintainer reads them in the database.

## Reviewing flags

A scheduled pass of the Worker (`worker/review.ts`, cron trigger `*/10 * * * *` in `wrangler.jsonc`) reviews the reports that wait. Cron triggers run on the deployed Worker only, not on preview URLs. With nothing waiting a pass reads one table and stops.

- **What a pass does.** It takes up to `REVIEW_BATCH` reports in state `sent`, oldest first, and for each asks every model in `REVIEW_MODELS` for a verdict. A reviewer gets the reviewer's instructions (`REVIEW_GUIDE`, `src/ai-shared/flag-review.ts`), the tutor's lookup tools, and one message: the tutor's card for the pair, the learner's answer, the tutor's explanation and the flag. It answers with one JSON object (`verdict`, `cause`, `reply`, `fix`, `confident`) that has to parse exactly (`parseReview`). The rule in `src/domain/flags.ts` (`decideFlag`) turns the verdicts into the outcome:
  - `reply`: both are sure that the learner is wrong, or that the tutor's text was wrong. The reply is shown to the sender (state `answered`); a tutor fault is kept as the cause `tutor` for the list of tutor improvements.
  - `fix`: both are sure that it is wording only. The reply is shown (`answered`) and the change waits to be made.
  - `escalate`: the fault is in the data, the rules that build pairs or the grading; or the reviewers disagree, are unsure, or fewer than two answered. State `maintainer`. When both are sure of the verdict and the cause, their agreed reply is shown meanwhile; otherwise there is none.
- **Without a model.** A follow-up on a reply (`part: "reply"`), a flag whose exercise was not kept, and one whose exercise cannot be read go to the maintainer at once.
- **Budget.** Reviews have their own counter (`budget`, scope `review`) and their own daily cap (`REVIEW_DAILY_BUDGET_USD`); the tutor's budgets are not touched. A flag holds `REVIEW_RESERVE_USD` until its reviews finish and is then settled at the real cost; each reviewer's call is a line in `usage_log` with the kind `review` and the sender's device id. When the day's cap is used, the reports that need a model wait for the next day.
- **Failures.** When the model API fails, the report is given back and tried by the next pass, up to three times; after that it goes to the maintainer with what there is (usually "fewer than two reviews"). A claim older than 15 minutes (a pass that was cut off) is taken over.
- **Edits.** The same words sent again keep their review, also when only the flag's own state or time changed. Changed words, or a changed answer, start the review again, and a review that is running on the old words is dropped.
- **What the reviewer sees from the device.** The stored answer is read into a fixed shape and every text is cut (`readReviewAnswer`); the learner's note, suggestion, question and what the tutor said are cut and written as quoted strings; the instructions tell the reviewer that all of it is material and never instructions. The reviewers can only read. The pair itself is still the one the device sent (its labels, notes and reference examples, cut but not checked against the data); the card's facts about the terms come from the server's own data.
- **Switch.** `INSERT OR REPLACE INTO settings (key, value) VALUES ('review', 'off');` stops the pass (reports are still taken); deleting the row turns it on. A `REVIEW_DAILY_BUDGET_USD` of `0` also closes it. The columns the pass writes (`reply`, `outcome`, `cause`, `reason`, `fix`, `reviews` and others) come with the migration `0006_flag_review.sql`; until it has been applied `/api/health` says `reports: "off"`.
- **Privacy.** The reviewing models get the flag, the stored answer and the course text that the card and the tools hold, through the same API as the tutor. The reply is shown only to a request that proves the Magic Key. `fix`, `cause`, `reason` and the reviewers' answers stay on the server for the maintainer.

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
   Apply it again after any pull request that adds a file to `worker/migrations/` (`0002_accounts.sql` adds the accounts, `0005_flag_reports.sql` the flag reports and `0006_flag_review.sql` their review; the app works without them and `/api/health` says `accounts: "off"` or `reports: "off"`). Accounts need no secret and no extra service.
3. Store the two secrets on the Worker (the commands ask for the value at a prompt):
   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put RIGLAM_DATA_KEY     # the Magic Key: the words in the shared link
   ```
   Worker Previews do not inherit these secrets: give a Preview its own through the Preview base configuration (docs/DEPLOY.md).
4. Deploy as usual. Check `GET /api/health`.

**Kill switch.** In the Cloudflare dashboard (D1, the database, Console): `INSERT OR REPLACE INTO settings (key, value) VALUES ('tutor', 'off');` stops every tutor request at once; deleting the row (or any value but `off`) turns it on again. Archiving the API key in the Console or setting the workspace limit to zero also stops all spending.

**Privacy.** Without an account the Worker keeps spend counters and the usage log above, keyed by the random device id. With one it also keeps the account's random id, the name the person chose, a public key and the time of use per passkey, and the person's documents (answers they gave, debates, favorites, skipped pairs and the like), until they delete the account. Workers Logs are on for the lines the Worker writes itself (error names and statuses, never question text); per-request invocation logs are off.

## Tests

`tests/worker/` runs under plain Vitest (`npm run test:unit`) with stand-ins:

- D1 is a SQLite in memory (`node:sqlite`) with the real migrations applied, so the SQL that counts money is the SQL that runs in production.
- The model API is a `fetch` that answers with scripted server-sent events, so the real SDK client parses them (text, tool calls, `max_tokens`, refusals, HTTP errors, a call that hangs until the page goes away).
- The kit is made from a few invented terms in a fake database; the last test block runs on the real course data when `data-private/` is there (as in CI, [DATA.md](DATA.md)) and is skipped otherwise.
- Passkeys are made by a software authenticator (`tests/worker/authenticator.ts`) that produces the bytes a phone would (a `none` attestation with an ES256 key, signed assertions), so the library's real verification runs.

`reports.test.ts` and `review.test.ts` cover the reports (the Magic Key, the limits, taking one back) and the scheduled review (which reports a pass takes, what each model is asked, every outcome, the budget, failures and retries, an edit made during a review, and what the sender can read back).

`accounts.test.ts` covers making an account, signing in, every refusal (another site's origin, a replayed or expired challenge, a passkey for another host name, a key that is not the account's), sessions, the limits, deleting and the switches; `sync.test.ts` covers who may sync, what a write may be, how two devices settle a document and the limits. They also cover the kit (the tools, the notes, a category id that is not the data's own, the wrong key, no text in the log), the proof, the settings, the prices, the counters (including simultaneous questions), every refusal path, a plain answer with the exact model request, tool rounds and their failure, the last-round rule, every failure of the model call, and the page going away.

What they cannot show is the Workers runtime itself. To try the Worker in `wrangler dev`, give it a local D1 binding (`wrangler d1 migrations apply <name> --local`), set `ANTHROPIC_BASE_URL` to a stand-in for the model API and use a throwaway Magic Key. Note that `wrangler dev`'s local proxy does not pass on a client that hangs up, so a page going away mid-answer can only be seen in the unit tests or on a deployed Worker (the `outcome` column of `usage_log` shows `aborted`).
