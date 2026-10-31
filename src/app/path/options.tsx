// The practice options of the exercise on screen (the Design Lab's "Settings and options", round 3): a sheet from the top bar, its lines in groups
// (path/lines.tsx): under the exercise's name what is its own, under Practice what every exercise has where it is built, then the way on to Settings;
// a line's own page opens in the sheet. The settings themselves are kept and stored on the device by shell/session.js, stages.js and voice.js. The stages and the difficulty are not among them: they live on the Progression page, behind the top bar's ring (path/progression.tsx).
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { NOT } from "../../ai-shared/debate.ts";
import { setQuorum } from "../ai/quorum.js";
import { setCategoriesAsk } from "../categories/flow.js";
import { setInstanceSuggest } from "../instance/flow.ts";
import { canAsk } from "../core/ask.js";
import { WORDINGS } from "../debate/text.js";
import { exName } from "../shell/exercises.js";
import { GUIDES, guided, setGuided } from "../practice/guided.ts";
import { progressNow } from "../practice/stage-offer.ts";
import { toggleOpts } from "../shell/options.js";
import { SYMS, openPage, quorumNote, setAutoExplain, setNota, setShow, setSyllogismWording, setWording, toggleSess } from "../shell/session.js";
import { kindMs, setBlitz, setTimer } from "../shell/timers.js";
import { ANSWER_PICKS, CONFIRM_PICKS, RATES, READ_NOTE, SAMPLE, VOICE_LEAD, VOICE_SAY, WHERE, hookVoices, setVoice, voiceGroups, voiceShown } from "../shell/voice.js";
import { LADDER_TOP } from "../../domain/stages.ts";
import { type TimeKind, timesOf } from "../../domain/sprint.ts";
import { canHear, canSpeak, speak, voiceList } from "../../ui/speech";
import { ProgressPage } from "./progress.tsx";
import { D, Icon, Knob, Toggle, Words, NOFILL } from "./ui.tsx";
import { Group, Intro, Line } from "./lines.tsx";
import { DEFAULT_LOOK, currentLook, setLook } from "./look.ts";
import { Sub } from "./subjects.tsx";

// the names in the margin are short, as the lab's are: six letters fit beside the line
export const Row = ({ lb, children, go }: { lb: string; children?: ComponentChildren; go?: { page: string; label?: string } }) =>
  <div class={"porow" + (go ? " pgo" : "")}><span class="lb">{lb}</span><div class="ptx">{children}</div>{go ? <More {...go} /> : null}</div>;
/** A row that is a switch: its name and what it does, and the toggle. */
export const Switch = ({ lb, title, note, on, toggle }: { lb: string; title: string; note?: string; on: boolean; toggle: () => void }) =>
  <Row lb={lb}><button type="button" class="two" role="switch" aria-checked={on ? "true" : "false"} onClick={toggle}><span><b>{title}</b>{note ? <small>{note}</small> : null}</span><Toggle on={on} /></button></Row>;
/** The way into a row's own page: a control at the row's right edge, as tall as the row, so that it takes no line of the row and is easy to tap. */
const More = ({ page, label = "more" }: { page: string; label?: string }) => <button type="button" class="more" aria-label={(TITLES[page] || page) + ": " + label} onClick={() => openPage(page)}><Icon n="chev" /></button>;
const secs = (kind: string) => Math.round(kindMs(kind) / 1000);
/** The times of Sprint, by what they time (domain/sprint.ts): the name each has on its line, and what it covers in the exercise on screen. */
const TIME_NAME: Record<TimeKind, string> = { rel: "Relation", q: "Choosing", ex: "Writing", syl: "Reply", cats: "Categories", cat: "One category" };
const TIME_NOTE = (k: TimeKind, tab: string): string => ({
  rel: "choosing the relation",
  q: "each statement: Accept or Why?",
  ex: tab === "practice" ? "each example, one case at a time" : tab === "debate" ? "the example after Why?" : tab === "find" ? "each example, and twice this for naming the pair" : "naming something, or saying that nothing is",
  syl: "the reply to each syllogism",
  cats: "all the categories on one screen",
  cat: "each yes or no, with One category at a time",
} as Record<TimeKind, string>)[k];
/** What time up does in each exercise. */
const TIME_UP: Record<string, string> = {
  practice: "On the relation, the right one is shown and the examples come next. On an example, the case stays as it is and the next one opens.",
  debate: "On a statement, it counts as accepted. On the example after Why?, what you wrote stands. On the relation, the result shows the right one.",
  syllogism: "With no reply the answer counts as wrong, and the result names the right one.",
  find: "On naming the pair, two words go on to the examples; anything less is a miss and the next relation comes. On an example, as in Relations.",
  categories: "What is ticked stands and is checked as it is; with one category at a time, an unanswered category counts as no.",
  instance: "What is written stands and is checked; with nothing written it is a miss and the next set comes.",
};
const timesLine = () => timesOf(state.tab).map((k) => TIME_NAME[k] + " " + secs(k) + " s").join(" · ");
const toSettings = () => { toggleSess(false); toggleOpts(true); };
/** Whether the Tutor row (and its page) is in the list: where the tutor can be asked, and the Quorum switch is offered. Categories and Find an instance have neither. */
const quorumShown = () => state.quorumOffered && !!state.db && state.tab !== "syllogism" && state.tab !== "categories" && state.tab !== "instance";
const tutorShown = () => state.tab !== "categories" && state.tab !== "instance" && (canAsk() || quorumShown());

const NOTA_NAMES = () => Object.entries(SYMS).map(([k, v]) => [k, (v as unknown[])[0] as string] as [string, string]);
const WORDING_NAMES = () => Object.entries(WORDINGS).map(([k, w]) => [k, (w as { name: string }).name] as [string, string]);
const SYL_WORDINGS: [string, string][] = [["take", "Take X"], ["formal", "Formal"]];
// A and B in the text: Off is the A/B markers switch, the others the look's style of them (Plain is Off now)
const AB_STYLES: [string, string][] = [["off", "Off"], ["italic", "Italic"], ["letters", "Letters"], ["diamonds", "Diamonds"], ["lettered", "Lettered"], ["inks", "Inks"]];
const abNow = () => (!state.showAB || currentLook().subj === "none" ? "off" : currentLook().subj);
function setAB(k: string) {
  if (k === "off") { setShow("ab", false); return; }
  setLook({ subj: k === DEFAULT_LOOK.subj ? null : k }); setShow("ab", true);
}
const nameIn = (list: [string, string][], k: string) => (list.find(([x]) => x === k) || list[0]!)[1];
/** The exercises that write the relations in a notation and mark A and B in the text. */
const signs = () => state.tab === "practice" || state.tab === "debate" || state.tab === "find";
const wordings = (): [string, string][] | null => state.tab === "debate" ? WORDING_NAMES() : state.tab === "syllogism" ? SYL_WORDINGS : null;
const wordingNow = () => state.tab === "syllogism" ? state.syllogismWording : state.wording;
const setWordingNow = (k: string) => (state.tab === "syllogism" ? setSyllogismWording(k) : setWording(k));
/** What Wording and notation is set to, in a line. */
const textLine = () => {
  const w = wordings();
  return [w ? nameIn(w, wordingNow()) : "", signs() ? nameIn(NOTA_NAMES(), state.nota) : "", signs() ? "A and B: " + nameIn(AB_STYLES, abNow()).toLowerCase() : ""].filter(Boolean).join(" · ");
};
const ANSWER_NAMES: Record<string, string> = { off: "off", tap: "tap the mic", auto: "hands-free" };
const voiceLine = () => [canSpeak() && state.voice.read ? "reads each question" : "", canHear() ? "answer: " + (ANSWER_NAMES[state.voice.answer] || state.voice.answer) : ""].filter(Boolean).join(" · ") || "the voice and its speed";
const TUTOR: [string, string][] = [["every", "Every answer"], ["ask", "When I ask"]];
const setTutor = (k: string) => setAutoExplain(k === "every");

/** The list: under the exercise's name what is its own, under Practice what every exercise has where it is built, and the way on to Settings. */
function List() {
  const tab = state.tab;
  const guide = GUIDES[tab] ? <Line title="Guided" sub={GUIDES[tab]!.on} sw={{ on: guided(tab), toggle: () => setGuided(tab, !guided(tab)) }} /> : null;
  return <>
    <Group name={exName(tab)}>
      {guide}
      {tab === "instance" ? <Line title="Guided" sub="things the course knows, suggested as you write" sw={{ on: state.instSuggest, toggle: () => setInstanceSuggest(!state.instSuggest) }} /> : null}
      {tab === "categories" ? <Line title="One category at a time" sub="a yes or a no for each, in turn" sw={{ on: state.catsAsk === "one", toggle: () => setCategoriesAsk(state.catsAsk === "one" ? "all" : "one") }} /> : null}
      {wordings() || signs() ? <Line title="Wording and notation" sub={textLine()} go={() => openPage("text")} /> : null}
    </Group>
    <Group name="Practice">
      <Line title="Sprint" sub={state.blitz ? timesLine() : "off"} sw={{ on: state.blitz, toggle: () => setBlitz(!state.blitz) }} go={() => openPage("times")} />
      {tutorShown() ? <Line title="Explanations by Claude" go={() => openPage("tutor")} sub={canAsk() ? undefined : "several models"}>
        {canAsk() ? <Words label="Explanations by Claude" items={TUTOR} cur={state.autoExplain ? "every" : "ask"} on={setTutor} /> : null}</Line> : null}
      {voiceShown() ? <Line title="Voice" tag="experimental" sub={voiceLine()} go={() => openPage("voice")} /> : null}
    </Group>
    <Group><Line title="Other app settings" go={toSettings} /></Group>
  </>;
}

/** A page's choices: one pressed, each with a word on what it does (the choices on the path, as the lab draws them). */
function Picks<T extends string>({ label, items, cur, on }: { label: string; items: [T, string, string, ComponentChildren?][]; cur: T; on: (k: T) => void }) {
  return <div class="chs" role="group" aria-label={label}>{items.map(([k, name, desc, extra]) =>
    <button type="button" class={"crow" + (cur === k ? " picked" : "")} aria-pressed={cur === k ? "true" : "false"} onClick={() => on(k)}>
      <span class="mc"><D cls={"sub " + (cur === k ? "yours" : "pk")} /></span><span class="ct"><b>{name}</b>{desc ? <small>{desc}</small> : null}{extra || null}</span>
    </button>)}</div>;
}
const sample = (w: { lead?: string; q: unknown[][] }) => (w.lead ? w.lead + " " : "") + w.q[1].map((x) => (x === NOT ? "not" : x)).join("");
/** One Sprint time: the usual ones, and a number of seconds of one's own. */
function Time({ kind, label, note }: { kind: string; label: string; note: string }) {
  const now = secs(kind), preset = [5, 10, 15, 20, 30].includes(now);
  return <Line title={label} sub={note}>
    <span style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
      <Words label={label} items={[[5, "5 s"], [10, "10 s"], [15, "15 s"], [20, "20 s"], [30, "30 s"]]} cur={preset ? now : -1} on={(s) => setTimer(s * 1000, kind)} />
      <input type="number" min="2" max="120" inputMode="numeric" class="pfield" style={{ flex: "none", width: "64px", height: "28px", fontSize: "16px" }} placeholder="sec" {...NOFILL} aria-label={"Custom " + label.toLowerCase() + " in seconds"}
        value={preset ? "" : String(now)} onChange={(e) => { const v = Math.round(+(e.currentTarget as HTMLInputElement).value); if (v >= 2 && v <= 120) setTimer(v * 1000, kind); }}
        onKeyDown={(e) => e.stopPropagation()} />
    </span></Line>;
}
/** Wording and notation: how the questions and the answers are written in this exercise. */
function TextPage() {
  const w = wordings(), wk = wordingNow(), rows = (SYMS as unknown as Record<string, [string, string, [string, string][]]>)[state.nota]![2];
  const wsample = state.tab === "debate" ? sample((WORDINGS as unknown as Record<string, { lead?: string; q: unknown[][] }>)[wk]!) : wk === "formal" ? "It follows that the subject, X, is P because of being R." : "Take X. It follows it is P because it is R.";
  return <>
    <Intro>{"How the questions and the answers are written in " + exName(state.tab) + "."}</Intro>
    {w ? <Line title="Wording" sub={state.tab === "debate" ? "the four statements you accept or answer with Why?" : "how the syllogism is put"}>
      <Words label="Wording" items={w} cur={wk} on={setWordingNow} /><span class="olsamp">{wsample}</span></Line> : null}
    {signs() ? <Line title="Notation" sub="the same in Relations, Pervasions and Find a pair">
      <Words label="Notation" items={NOTA_NAMES()} cur={state.nota} on={setNota} />
      <span class="olsamp">{rows.map(([sym, t]) => <span class="olsym"><b class="mono">{sym}</b> {t}</span>)}</span></Line> : null}
    {signs() ? <Line title="A and B in the text" sub="how the pair's two terms stand out where a question or a note names them">
      <Words label="A and B in the text" items={AB_STYLES} cur={abNow()} on={setAB} />
      <span class="olsamp">Name something that is <b class="conn">both</b> <Sub k="a">a thing that is heard</Sub> <b class="conn">and</b> <Sub k="b">a sound</Sub>.</span></Line> : null}
  </>;
}
function Page({ id }: { id: string }) {
  if (id === "text") return <TextPage />;
  if (id === "times") return <>
    <Intro>{"A clock for each step, switched on and off with the stopwatch in the top bar (each exercise keeps its own); hold the stopwatch to come back here. " + (TIME_UP[state.tab] || "")}</Intro>
    {timesOf(state.tab).map((k) => <Time kind={k} label={TIME_NAME[k]} note={TIME_NOTE(k, state.tab)} />)}</>;
  if (id === "voice") return <VoicePage />;
  if (id === "tutor") return <TutorPage />;
  if (id === "progress") return <ProgressPage />;
  return null;
}
/** The Voice page: the voice and its speed, how an answer is taken and what happens after it is heard. */
function VoicePage() {
  const v = state.voice, list = canSpeak() ? voiceList() : []; hookVoices();
  return <>
    <Intro>{VOICE_LEAD}</Intro>
    {canSpeak() ? <>
      <Line title="Read aloud" sub={"each question. " + READ_NOTE} sw={{ on: v.read, toggle: () => setVoice("read", !v.read) }} />
      <Line title="Voice" sub="This device’s English voices, by accent.">
        <span class="pvline2"><select class="psel" aria-label="Voice" value={v.voiceId || ""} onChange={(e) => setVoice("voiceId", (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">{"Best on this device" + (list[0] ? " (" + list[0].name + ")" : "")}</option>
          {voiceGroups(list).map((g: { accent: string; voices: { id: string; name: string; lang: string; local: boolean }[] }) => <optgroup label={g.accent}>
            {g.voices.map((x) => <option value={x.id}>{x.name + " · " + x.lang + (x.local ? "" : " · online")}</option>)}</optgroup>)}
        </select><button type="button" class="pbtn" onClick={() => speak(SAMPLE, { voice: v.voiceId, rate: v.rate })}>Try</button></span></Line>
      <Line title="Speed of reading"><Words label="Speed of reading" items={RATES as [number, string][]} cur={v.rate} on={(r) => setVoice("rate", r)} /></Line>
    </> : null}
    {canHear() ? <>
      <p class="glab">Answer by voice</p>
      <Picks label="Answer by voice" cur={v.answer} on={(k) => setVoice("answer", k)} items={ANSWER_PICKS as [string, string, string][]} />
      {v.answer !== "off" ? <><p class="glab">After an answer is heard</p>
        <Picks label="After an answer is heard" cur={v.confirm} on={(k) => setVoice("confirm", k)} items={CONFIRM_PICKS as [string, string, string][]} /></> : null}
      <p class="psub">{VOICE_SAY}</p>
      <p class="pnoteline pnote3">{WHERE}</p>
    </> : null}
    <p class="pnoteline pnote3">Voice itself is switched on and off in <button type="button" class="pbtn" style={{ padding: 0 }} onClick={toSettings}>Settings</button>, under Experiments.</p>
  </>;
}

/** The Tutor page: whether it explains every answer by itself or waits to be asked, and Quorum (several models). */
function TutorPage() {
  const syl = state.tab === "syllogism";
  return <>
    <Intro>Claude is an AI assistant. It explains the results, and checks examples you wrote that the reference data does not cover. It can make mistakes, so treat it as a study aid, not the last word. Where sources differ it says so. You can flag anything that looks wrong to help improve it.</Intro>
    {canAsk() ? <Line title="Explains" sub={"Every answer: right after you check one, Claude explains it" + (syl ? "" : " and checks the examples the page could not") + ". When I ask: it waits for you to ask."}>
      <Words label="Explanations by Claude" items={TUTOR} cur={state.autoExplain ? "every" : "ask"} on={setTutor} /></Line> : null}
    {quorumShown() ? <Line title="Three Claude models" tag="experimental" sub={quorumNote()} sw={{ on: state.quorum, toggle: () => setQuorum(!state.quorum) }} /> : null}
  </>;
}

/** The Path's pages of the practice options, by the names their lines have. */
const TITLES: Record<string, string> = { text: "Wording and notation", stages: "Difficulty", times: "Sprint", voice: "Voice", tutor: "Claude AI", progress: "Progression" };
const sheetOn = () => state.sessOpen && state.mode === "quiz";
/** The sheet's own page that is open (one of TITLES), or null for the list. */
const sheetPage = () => sheetOn() && state.sessPage && TITLES[state.sessPage] && (state.sessPage !== "voice" || voiceShown()) && (state.sessPage !== "tutor" || tutorShown()) ? state.sessPage : null;
/** The Progression page is open (the ring in the top bar opened it): the bar keeps the exercise's name and the ring, pressed, and the page hangs under it. */
export const progressOn = (): boolean => sheetPage() === "progress";
/** What the sheet shows, as the heading it gives the screen: the top bar reads it in place of the exercise's name while the sheet is open (null when it is closed, or is the Progression page). */
export const sheetTitle = (): string | null => sheetOn() && !progressOn() ? (sheetPage() ? TITLES[sheetPage() as string]! : "Practice options") : null;

/** The sheet of the practice options: from the top, under the top bar (which is its heading, and has its close), over a scrim; the knob at its foot folds it away. */
export function OptionsSheet() {
  const on = sheetOn(), page = sheetPage();
  const box = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), was = useRef(on);
  useEffect(() => {
    if (on && !was.current && box.current) box.current.focus({ preventScroll: true });
    was.current = on;
  }, [on]);
  // the body fades out at an edge that has more to scroll to (09-path-panels.css): measured after every draw, and as it scrolls
  useEffect(() => {
    const el = body.current; if (!el) return;
    const fade = () => {
      const up = el.scrollTop > 2, down = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
      el.style.setProperty("--ft", up ? "26px" : "0px"); el.style.setProperty("--fb", down ? "44px" : "0px"); el.toggleAttribute("data-fade", up || down);
    };
    fade(); el.addEventListener("scroll", fade, { passive: true });
    return () => el.removeEventListener("scroll", fade);
  });
  return <>
    <div class={"scrim below" + (on ? " on" : "")} onClick={() => toggleSess(false)} />
    <div ref={box} class={"psheet top" + (on ? " on" : "")} role="dialog" aria-label={page === "progress" ? "Progression" : "Practice options"} aria-hidden={on ? "false" : "true"} inert={!on} tabIndex={-1} data-quiet>
      <div class={"sbody" + (page === "progress" ? "" : " sfull")} ref={body}>
        {page === "progress" ? <p class="glab" style={{ paddingTop: "4px" }}>{"Stage " + progressNow().top + " of " + LADDER_TOP}</p> : null}
        {on ? (page ? <Page id={page} /> : <List />) : null}
      </div>
      <Knob up label="Fold the practice options away" onClick={() => toggleSess(false)} />
    </div>
  </>;
}
