# Tutor eval

A fixed set of exercise answers, re-asked of the tutor with today's prompts, and graded by code. Use it to tell whether a change to the tutor (the prompt texts in `src/ai-shared/prompts.ts`, the card, the lookup tools, the model or its effort) makes its judgments better or worse, instead of checking only the case that prompted the change.

Every run calls the Anthropic API and costs money. It never runs in CI.

## What a case is

A stored answer of the four-cells exercise, the debate or the pair-finding mode: the pair's two categories and labels, the relation the learner chose, and what the learner wrote in each cell (and, in the debate, Accept or Why? for each question). `cases.ts` rebuilds the pair with today's term data, grades the answer as the page does, and builds the explain request the page would send (the card and the ask, `cardBody` and `explainAsk`). The tutor then answers it through `runTutor` (`worker/tutor.ts`), with the server's kit (`worker/kit.ts`): the same standing instructions, fine points and lookup tools.

Each example in the answer carries a label for side A and for side B:

- **yes** or **no**;
- **open:** the example's name does not say the quality that side is about ("a car" for black things). The term data marks these for the things it lists, and the tutor's "unsure" is right there;
- **debated:** the sources or the readings differ (whether a composite such as a table is itself a tangible object). No answer is graded right or wrong; the report lists what was said, for a reader or a judge to check that the tutor names the readings;
- **unsure:** what the example names is unclear;
- or a list of these, all of them right. A thing in the practice list takes its label from the term data. Any other example takes it from a hand-made labels file.

## What is graded

`grade.ts` reads the answer's lines as the page does (`parseFactLine`, last line per cell) and marks each side of each example:

- **right:** the answer is one the label allows;
- **wrong:** yes where the label says no, or no for yes (the error that misleads a learner);
- **hedged:** unsure where the label is definite;
- **over-sure:** definite where only open or unsure is right (a feature the example's name does not say);
- **missing:** no line for the example.

It also checks the form rules that code can check: a cell written twice, "wait" or "actually", Markdown, an example's own name as its reason, "only" in a pervasion, and the Common locus, Pervasion and Relation lines. The quality of a reason needs a reader and is not graded here.

`report.ts` sums up a run per config, with a 95% interval drawn over cases, so that a difference smaller than the noise shows as such. Its score counts the settled sides only; debated sides are counted and listed apart.

## Data

The cases quote learners' answers and the labels come with them, so they are kept out of the repository, in the git-ignored `data-private/eval/`:

- `staging-answers.jsonl`: one stored answer per line, `[col, mode, catA, catB, labelA, labelB, neg, relation, chosen, [both, anb, bna, nei], qs]`. A cell is the text written, `-` for marked empty, and ends in `@` where the page could not check it; `qs` is the debate's answers in order (`a` Accept, `w` Why?, `t` time ran out).
- `labels.json`: `"<catA>|<catB>|<neg>|<example>"` (example lower case, without its article) to `{ "a", "b", "why" }`; for a pair of the learner's own, `"<labelA>|<labelB>|relation"` to `{ "rel" }`.

The kit needs the course data in `data-private/` as for the artifact build (`definitions.json`, `notes.json`, see [docs/DATA.md](../../docs/DATA.md)), and optionally the reference examples (`examples-device.json`, the body of `GET /api/course/examples`).

`split.ts` puts about one case in three in a test half by a hash of its id. When tuning the prompt, look at the train cases' answers only, and keep a change only if the test half improves too.

## Commands

```sh
npm run eval:selftest                  # builds the kit and the cases, grades a known answer; no API call
npm run eval:tutor -- --dry            # the cases and the first request
RIGLAM_EVAL_API_KEY=... npm run eval:tutor -- --configs claude-sonnet-5-5:medium,claude-haiku-5-5:medium --repeats 3 --out data-private/eval/runs/base.jsonl
npm run eval:report -- data-private/eval/runs/base.jsonl [--split test] [--md report.md] [--regrade]
```

`--budget <USD>` (default 30) stops starting new calls once that much is spent. A line already in `--out` is skipped, so a run that stopped goes on where it left off.

`--regrade` grades the stored answers again against today's labels, so correcting a label after a run needs no new call.
