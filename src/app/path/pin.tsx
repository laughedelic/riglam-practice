// The pinned line (the lab "Updates and what's new", round 2, picked 1 Nov 2026): one line above the bottom, where nothing is covered. Above the stage rings on the roadmap,
// and in an exercise on the thread above the next station, where Claude's waiting line stands. It says one thing the learner may want to act on: a newer version waits
// (path/news.tsx), or the device's storage does not answer (path/storage.tsx). 20-path-news.css.

/**
 * The pinned line, drawn as Claude's waiting line is: a mark on the thread, the words (in a light that passes over them, with `shine`), the way on at the right end.
 * The words open the page that says more (`words`). `mark`: the small sign on the thread in an exercise (an arrow up for a version that waits).
 */
export function PinLine({ cls, text, label, act, words, shine, disabled = false, mark = "↑" }: {
  cls: string; text: string; label: string; act: () => void; words: () => void; shine: boolean; disabled?: boolean; mark?: string;
}) {
  return <div class={"pinln " + cls} role="status">
    {cls.includes("onfoot") ? <span class="pind" aria-hidden="true">{mark}</span> : null}
    <button type="button" class="pint" onClick={words}><span class={"pinw" + (shine ? " shine" : "")}>{text}</span></button>
    <button type="button" class="pbtn quiet pinb" onClick={act} disabled={disabled} aria-busy={disabled ? "true" : undefined}>{label}</button>
  </div>;
}
