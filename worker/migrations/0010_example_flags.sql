-- How many learners' flags named an example against this category (worker/learned.ts, flagFacts; docs/SERVER.md, "Learned facts"). A flag on a row that
-- may be served disputes it at once; the count is what the maintainer's list (worker/examples-admin.ts) shows of it, apart from the analyses' own
-- `against`. A row the maintainer reviewed keeps its answer and counts the flag all the same.
ALTER TABLE example_facts ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;
