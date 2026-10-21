-- What the server has learned about the examples learners type (worker/learned.ts, src/domain/learned.ts; docs/SERVER.md, "Learned facts"):
-- one row per example and category, written after an explain question when the server has EXAMPLE_FACTS set and the page named the examples it could
-- not check. Unlike usage_log, THIS TABLE HOLDS TEXT: the example as typed (at most 80 characters) and the models' reasons. It holds no device or
-- account id, no pair, no cell and nothing of where the learner put the example. Read it in the Cloudflare dashboard's D1 console, for example:
--   SELECT thing, cat, answer, state, agree, against, seen FROM example_facts ORDER BY last_day DESC LIMIT 20;
CREATE TABLE example_facts (
  -- the example's key (factKey: lower case, American spelling, no article)
  thing TEXT NOT NULL,
  -- a category id of the term data
  cat TEXT NOT NULL,
  -- 'yes' | 'no' | 'unsure': is the example in the category
  answer TEXT NOT NULL,
  -- the class the analysis named, when it is a term of the data; '' otherwise
  cls TEXT NOT NULL,
  -- the analysis's reason, at most 200 characters
  reason TEXT NOT NULL,
  -- 'candidate' | 'checked' | 'disputed' | 'reviewed'; only checked (of the current epoch) and reviewed rows may be served
  state TEXT NOT NULL,
  -- analyses that gave this answer, and those that gave the other one or were split
  agree INTEGER NOT NULL,
  against INTEGER NOT NULL,
  -- 'explain' | 'quorum' | 'maintainer'
  src TEXT NOT NULL,
  -- JSON: the last analysis, [{model, answer}]
  models TEXT NOT NULL,
  -- the version of the prompts and the term data (FACTS_EPOCH)
  epoch INTEGER NOT NULL,
  -- the example as last typed
  text TEXT NOT NULL,
  seen INTEGER NOT NULL,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL,
  PRIMARY KEY (thing, cat)
);
CREATE INDEX example_facts_state ON example_facts (state, last_day);
