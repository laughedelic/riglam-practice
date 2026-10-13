// Development only: a stand-in for the model, so that the tutor, "Explain", the follow-up chat and the check lab can be worked on with
// `npm run dev` without a key or a server. Nothing is called; the replies are fixed text in the shape the page reads (the lines of
// the explanation, the verdicts at the end of a cell line, the lab's JSON), so the page's parsing and layout run for real.
//
// It is not part of any build: platform.ts imports it behind `import.meta.env.DEV`, and tests/unit/pwa-build.test.ts looks for DEV_MARK
// in dist/pwa. The address can change what the stand-in does: `?ai=off` has no `sample` at all (as the installed app), `?ai=slow` streams
// slowly, `?ai=rate_limited` and `?ai=error` fail the way the page's error messages expect.
import type { Sample, SampleOptions, SampleResult } from "../platform/types";

export const DEV_MARK = "Dev stand-in";

type Turns = Parameters<Sample>[0];

const lastUserText = (turns: Turns): string => (typeof turns === "string" ? turns : ([...turns].reverse().find((t) => t.role === "user")?.content ?? ""));

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });

/** The page's first turn is the card and then the question after a blank line; later turns are the question alone. */
const askOf = (turn: string): string => {
  const explain = /Explain this (answer|debate)\. Use these lines/.exec(turn);
  return explain ? turn.slice(explain.index) : (turn.split("\n\n").at(-1) ?? turn);
};

/** The cells the page could not check and asked for a verdict on (its request names them: "could not check the examples in: Both, A not B."). */
function openCells(ask: string): string[] {
  const m = /could not check the examples in: ([^.]*)\./.exec(ask);
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function explain(ask: string): string {
  const debate = /^Explain this debate/.test(ask);
  const verdicts = ["yes", "no", "unsure"];
  const cells = openCells(ask).map((name, i) => `${name}: ${DEV_MARK}, no model was asked, so it ${i % 3 === 1 ? "does not fit" : "fits"} => ${verdicts[i % 3]}`);
  return [
    ...cells,
    debate ? "Relation: the first three answers give the relation you chose." : "Common locus: yes, a clay pot, which is long enough to wrap over several lines on a narrow phone.",
    "Pervasion: whatever is A is B, and the reverse.",
    `Explanation: ${DEV_MARK}. Look at which of the two terms the example belongs to first, then at the relation.`,
    "Misconception: none.",
  ].join("\n");
}

function lab(prompt: string): string {
  const judge = prompt.includes("You are the judge");
  const things = [...(prompt.split("Things:\n")[1] ?? "").matchAll(/^\d+\. (".*")$/gm)].map((m) => JSON.parse(m[1]) as string);
  return JSON.stringify({
    things: things.map((thing) => ({ thing, reading: `${DEV_MARK}: ${thing}`, inA: true, inB: true, exists: true, unsure: false, ...(judge ? { right: [1, 2, 3], reason: DEV_MARK } : {}) })),
  });
}

function reply(turns: Turns, options: SampleOptions): string {
  if (options.model) return lab(typeof turns === "string" ? turns : JSON.stringify(turns));
  const ask = askOf(lastUserText(turns));
  if (/^Explain this (answer|debate)/.test(ask)) return explain(ask);
  return `${DEV_MARK}: no model is called here. You asked: “${ask.slice(0, 160)}”`;
}

const cancelled = (text: string) => Object.assign(new Error("cancelled"), { code: "cancelled", text });

/** The stand-in `sample`. `mode` is the value of `?ai=` in the address. */
export function devSample(mode: string | null = null): Sample {
  return async (turns, options = {}): Promise<SampleResult> => {
    const failure = mode === "rate_limited" ? "rate_limited" : mode === "error" ? "error" : null;
    await wait(failure ? 300 : 250, options.signal);
    if (options.signal?.aborted) throw cancelled(""); // Stop pressed while waiting: cancelled, not the failure the mode asks for
    if (failure) throw Object.assign(new Error(failure), { code: failure });

    const text = reply(turns, options);
    if (options.model) return { text, truncated: false, modelApplied: options.model, modelTierApplied: options.modelTier };

    // stream it as words, the way the real call delivers text, so "Thinking", the growing answer and Stop are all there to see
    const words = text.split(/(?<=\s)/);
    const step = mode === "slow" ? 400 : 25;
    let sofar = "";
    for (const word of words) {
      if (options.signal?.aborted) throw cancelled(sofar);
      sofar += word;
      options.onText?.({ text: sofar });
      await wait(step, options.signal);
    }
    if (options.signal?.aborted) throw cancelled(sofar);
    return { text, truncated: false };
  };
}
