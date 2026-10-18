-- Quorum's records (worker/quorum.ts). Only a server that has QUORUM=on writes them, which is a Preview with its own database (wrangler.jsonc,
-- "previews"); production never does. One row per Quorum question: every model's answer, the judge's, which text the learner saw, and the examples
-- with the cell each call gave them (docs/SERVER.md, "Quorum"). Unlike usage_log, THIS TABLE HOLDS TEXT: the card
-- of the pair with what the learner wrote, and the answers. A person who turns Quorum off in Options (or has no Magic Key) adds none.
-- A row does not say which device asked: the text is kept for what the models said about the examples, not for whose it was.
-- Rows are not pruned. Read them in the Cloudflare dashboard's D1 console, for example:
--   SELECT at, json_extract(things, '$[0].example') AS example, disputed, shown FROM quorum_records ORDER BY at DESC LIMIT 20;
CREATE TABLE quorum_records (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  day TEXT NOT NULL,
  -- 'explain' (Quorum answers nothing else)
  kind TEXT NOT NULL,
  -- JSON: the ids of the pair's categories, as the page sent them
  cats TEXT NOT NULL,
  -- the first turn of the conversation: the pair's card with the learner's answer, cut at 6000 characters
  prompt TEXT NOT NULL,
  -- JSON: [{example, lines: [cell of each line it stood in], cells: {<call name>: cell | null}}], the examples the answers classify; null = unsure
  things TEXT NOT NULL,
  -- JSON: the calls [{name, model, ok, ms, text, error?, truncated?}]: the models in order, then the judge when it was asked
  runs TEXT NOT NULL,
  -- the name of the call whose text the learner saw
  shown TEXT NOT NULL,
  -- 1 when the judge was asked
  judged INTEGER NOT NULL,
  -- how many examples the models gave different cells for
  disputed INTEGER NOT NULL,
  micro INTEGER NOT NULL,
  outcome TEXT NOT NULL
);
CREATE INDEX quorum_records_day ON quorum_records (day);
