-- The maintainer's decisions on flag reports (docs/SERVER.md, "Maintainer access"): the decision is recorded next to the report. The
-- reply a decision gives is the reply column of 0006, which the sender reads; `decision` is for the maintainer's own record (what was
-- decided and where it was done, for example a pull request) and is never sent to a device. decided_at: when.
ALTER TABLE flag_reports ADD COLUMN decision TEXT;
ALTER TABLE flag_reports ADD COLUMN decided_at TEXT;
