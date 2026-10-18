-- The review of flag reports (docs/SERVER.md, "Reviewing flags"): a scheduled pass reads each report that is waiting, asks two
-- reviewing models, and records what the rule in src/domain/flags.ts (decideFlag) makes of their answers.
--
-- state, in the order a report goes through: 'sent' (waiting for review), 'answered' (a reply stands; with outcome 'fix' a change
-- of wording is waiting to be made), 'maintainer' (the maintainer decides; reply may hold a first answer meanwhile), and the
-- maintainer's own: 'fixed' and 'decided'. Only reply, reply_at and state are ever sent back to a device.
-- outcome: 'reply', 'fix' or 'escalate' (what decideFlag said). cause: where the fault is (src/ai-shared/flag-review.ts).
-- reason: why, in a few words. fix: what to change, for the maintainer. reviews: the reviewers' answers as JSON, with the model of each.
-- digest: a short hash of the words of the report (worker/reports.ts), so that the same words sent again keep their review.
-- claimed_at: when a pass took the report, so that two passes do not review one report; attempts: how many passes took it.
ALTER TABLE flag_reports ADD COLUMN reply TEXT;
ALTER TABLE flag_reports ADD COLUMN reply_at TEXT;
ALTER TABLE flag_reports ADD COLUMN outcome TEXT;
ALTER TABLE flag_reports ADD COLUMN cause TEXT;
ALTER TABLE flag_reports ADD COLUMN reason TEXT;
ALTER TABLE flag_reports ADD COLUMN fix TEXT;
ALTER TABLE flag_reports ADD COLUMN reviews TEXT;
ALTER TABLE flag_reports ADD COLUMN reviewed_at TEXT;
ALTER TABLE flag_reports ADD COLUMN claimed_at TEXT;
ALTER TABLE flag_reports ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flag_reports ADD COLUMN digest TEXT;
