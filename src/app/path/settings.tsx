// Settings on the Path (the Design Lab's "Settings and options", round 3): full width, in sections of lines (path/lines.tsx), and a page of its own for a
// line that needs one. General: the languages and the theme. Data: the Magic Key, the account, sharing the examples, export and import. Experiments,
// shown only in a Preview, or in the real app on a device with the Magic Key after a hold on Version: the design, voice, the lab's settings. About: the
// version. What each does is the classic page's (shell/options.js and the shared rows of src/ui, which the Path builds in its own classes).
import { useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { accountControls } from "../../ui/account";
import { dataTransferControls } from "../../ui/data-transfer";
import { MAGIC_KEY_ABOUT, MAGIC_KEY_NOTE } from "../../ui/magic-key-note.ts";
import { setShare } from "../ai/share-notice.js";
import { canAsk } from "../core/ask.js";
import { el } from "../core/dom.js";
import { aboutInfo, keyNote, shareNote, toggleOpts } from "../shell/options.js";
import { render } from "../shell/render.js";
import { setLang } from "../shell/session.js";
import { LANGS, NAME_LANGS } from "../../domain/languages.ts";
import { languagesOn } from "./terms.tsx";
import { setOn as setVoiceOn, voiceAvailable, voiceNote, voiceOn } from "../shell/voice.js";
import { DEFAULT_LOOK, currentLook, lookLine, pastedLook, setLook, storedLook } from "./look.ts";
import { TopBar, pathNote } from "./shell.tsx";
import { Group, Intro, Line } from "./lines.tsx";
import { Bridge, Words, NOFILL } from "./ui.tsx";

/** The pages of Settings, by the names of their lines. */
const TITLES: Record<string, string> = { langs: "Languages", key: "Magic Key", acct: "Account", share: "Sharing examples", xfer: "Export and import", lab: "The lab's settings", ver: "Version and updates" };
const open = (id: string) => { state.optsPage = id; render(); const b = document.querySelector<HTMLElement>("#path .ptb .tstn"); if (b) b.focus({ preventScroll: true }); };
const back = () => { state.optsPage = null; render(); };
// how long Version is held to show Experiments
const HOLD_MS = 1500;

// the shared rows of src/ui (the account, your data) build their nodes with the classic page's classes; the Path's are put in their place
const PCLS: Record<string, string> = { btn: "pbtn", "btn ghost": "pbtn", onote: "pnoteline", "onote bad": "pnoteline bad", xfer: "pxfer", xferbox: "pxbox", xsum: "pxsum", acct: "pacct", acwho: "pacwho", acname: "pacname" };
const pel = (tag: string, props?: Record<string, any> | null, ...kids: any[]) => {
  const p = props ? { ...props } : props;
  if (p && typeof p.class === "string") p.class = PCLS[p.class] ?? p.class;
  if (p && tag === "input" && (p.type === "text" || !p.type)) p.class = "pfield";
  return el(tag, p, ...kids);
};
const SHORT: Record<string, string> = { ru: "RU", bo: "BO", skt: "SA", zh: "ZH" };
const langsLine = () => ["EN", ...LANGS.filter(({ id }) => languagesOn().includes(id)).map(({ id }) => SHORT[id])].join(" · ");
const acctShown = () => !!(state.account && state.db && state.account.view().available);
const keyShown = () => !!(state.unlock || state.keyHeld);
const shareShown = () => canAsk() && !!state.learns;
const expOn = () => state.preview || state.expShown;

/** The Languages page: English always, and a switch for each other language; the ones that are names only are experimental. */
function LanguagesPage() {
  const on = languagesOn();
  return <>
    <Intro>Shown beside a term when you meet it and in its definition. The course has definitions in English and, for most terms, Russian.</Intro>
    <Line title="English" sub="The terms and their definitions. Always shown." />
    {LANGS.map(({ id, name, note }) => <Line title={name} tag={NAME_LANGS.includes(id) ? "experimental" : undefined} sub={note[0]!.toUpperCase() + note.slice(1) + "."}
      sw={{ on: on.includes(id), toggle: () => setLang(id, !on.includes(id)) }} />)}
  </>;
}
/** The field the Magic Key is typed in, on its page (the prompt's own words and checks, platform `enter`): Unlock takes it, and the page then says the device has it. */
function KeyForm({ enter, label, cancel }: { enter: (text: string) => Promise<string | null>; label: string; cancel?: () => void }) {
  const [text, setText] = useState(""), [why, setWhy] = useState(""), [busy, setBusy] = useState(false);
  const go = async (e: Event) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setWhy("");
    const no = await enter(text);
    setBusy(false); if (no) setWhy(no); else setText("");
  };
  return <form class="pkeyform" onSubmit={(e) => void go(e)}>
    <input class="pfield" type="text" aria-label={label} placeholder="four words or the special link" {...NOFILL} value={text} onInput={(e) => { setText((e.currentTarget as HTMLInputElement).value); setWhy(""); }} />
    <span class="olctl"><button type="submit" class="pbtn" disabled={busy}>{busy ? "Checking…" : "Unlock"}</button>{cancel ? <button type="button" class="pbtn quiet" onClick={cancel}>Cancel</button> : null}</span>
    {why ? <p class="pnoteline bad" role="alert">{why}</p> : null}
  </form>;
}
/** The Magic Key: what it is and the field to enter it (as the prompt says it), or, while the device has it, another one or forget it after a question;
 *  why it has its name under a fold. A place that cannot take the key on the page opens its prompt over it. */
function KeyPage() {
  const held = !!state.keyHeld, k = state.keyHeld!, [another, setAnother] = useState(false);
  const enter = held ? k.enter : state.unlock && state.unlock.enter;
  const asking = !held || (another && !!enter);
  const field = enter ? <KeyForm enter={async (t) => { const no = await enter(t); if (!no) setAnother(false); return no; }} label={held ? "Another Magic Key or link" : "Magic Key or link"} cancel={held ? () => setAnother(false) : undefined} /> : null;
  return <>
    {asking ? <><Intro>{MAGIC_KEY_ABOUT[0]}</Intro><p class="sintro shint">{MAGIC_KEY_ABOUT[1]}</p></> : <Intro>{keyNote(true)}</Intro>}
    <div class="ol"><span class="olsw" /><span class="oltx"><span class="olbody">
      {!held ? field || <span class="olctl"><button type="button" class="pbtn" onClick={() => state.unlock!.open()}>Enter the Magic Key</button></span>
        : asking ? field
        : <span class="olctl">{state.keyAsk ? <><button type="button" class="pbtn" onClick={() => k.forget()}>Forget the key</button><button type="button" class="pbtn quiet" onClick={() => { state.keyAsk = false; render(); }}>Keep it</button></>
          : <><button type="button" class="pbtn" onClick={() => { if (field) setAnother(true); else void k.change(); }}>Enter another key</button><button type="button" class="pbtn quiet" onClick={() => { state.keyAsk = true; render(); }}>Forget the key</button></>}</span>}
      <details class="pkeyfun"><summary>Why “Magic Key”?</summary><span class="pkeynote">{MAGIC_KEY_NOTE.map((t: string) => <p>{t}</p>)}</span></details>
    </span></span><span /></div>
  </>;
}
/** The lab's settings: the Path Lab's picks this device uses, pasted from the lab, back to the defaults, or copied out. */
function LabPage() {
  const look = currentLook(), [opened, setOpened] = useState(false), [text, setText] = useState(""), [bad, setBad] = useState(false);
  const line = lookLine(look), own = labOwn();
  const keepMode = () => { const m = storedLook().mode; return { mode: m === undefined ? null : m }; };
  const use = () => {
    const ch = pastedLook(text); if (!ch) { setBad(true); return; }
    setLook({ ...ch, ...keepMode() }, true); setBad(false); setText(""); setOpened(false); render(); pathNote("The lab's settings are in use");
  };
  const copy = () => { try { void navigator.clipboard.writeText(line).then(() => pathNote("Copied"), () => pathNote("Could not copy")); } catch { pathNote("Could not copy"); } };
  return <>
    <Intro>{own ? "This device uses its own: colors, fonts and switches as set in the Path Lab." : "The defaults: the picks made in the Path Lab."}</Intro>
    <div class="ol"><span class="olsw" /><span class="oltx"><span class="olbody">
      <span class="olctl">
        <button type="button" class="pbtn" aria-expanded={opened ? "true" : "false"} onClick={() => setOpened(!opened)}>Paste from the lab</button>
        {own ? <button type="button" class="pbtn" onClick={() => { setLook(keepMode(), true); render(); pathNote("Back to the defaults"); }}>Back to the defaults</button> : null}
        {own ? <button type="button" class="pbtn" onClick={copy}>Copy this device's</button> : null}
      </span>
      {opened ? <span class="olctl">
        <textarea class="ptext" aria-label="The line from the lab's Copy settings" placeholder="Paste the line from Copy settings in the Path Lab" {...NOFILL} value={text} onInput={(e) => { setText((e.currentTarget as HTMLTextAreaElement).value); setBad(false); }} />
        {bad ? <p class="pnoteline bad">That is not a line from the lab's Copy settings.</p> : null}
        <button type="button" class="pbtn" onClick={use}>Use these</button>
      </span> : null}
    </span></span><span /></div>
  </>;
}
const labOwn = () => { const line = lookLine(currentLook()); return line !== "{}" && line !== JSON.stringify({ mode: currentLook().mode }); };
/** A page whose one line holds controls the shared rows of src/ui build. */
const Holder = ({ intro, children }: { intro?: string; children?: preact.ComponentChildren }) => <>
  {intro ? <Intro>{intro}</Intro> : null}
  <div class="ol"><span class="olsw" /><span class="oltx"><span class="olbody">{children}</span></span><span /></div>
</>;
/** Version and updates: which build this is, where the update stands, and its one step. */
function VersionPage() {
  const a = state.about; if (!a) return null;
  const i = aboutInfo(a), u = state.updates!;
  return <Holder intro={i.line}>
    <span class="pver">{i.from ? <p class="pnoteline">{i.from}</p> : null}<p class={"pnoteline" + (i.bad ? " bad" : "")} role="status">{i.status}</p></span>
    <span class="olctl">{i.act === "update" ? <button type="button" class="pbtn" onClick={() => u.apply()}>Update now</button> : i.act === "check" ? <button type="button" class="pbtn" onClick={() => u.check()}>Check for updates</button> : null}</span>
  </Holder>;
}
function Page({ id }: { id: string }) {
  if (id === "langs") return <LanguagesPage />;
  if (id === "key") return <KeyPage />;
  if (id === "acct") return <Holder><Bridge own cls="phost" fill={() => accountControls(state.account!, pel, render, state.acct)} /></Holder>;
  if (id === "share") return <><Intro>{shareNote()}</Intro>
    <Line title="Sharing examples" sw={{ on: state.shareExamples, toggle: () => { setShare(!state.shareExamples); render(); } }} sub={state.shareExamples ? "on" : "off"} /></>;
  if (id === "xfer") return <Holder intro="Saves everything this device keeps (answers, debates, favorites, skipped pairs and these settings) in one file, as a backup or to move to another device. Importing adds what is missing and never deletes anything.">
    <Bridge own cls="phost" fill={() => dataTransferControls(state.db!, pel, render, state.xfer)} /></Holder>;
  if (id === "lab") return <LabPage />;
  if (id === "ver") return <VersionPage />;
  return null;
}

/** What Version and updates says in its line: the version, and where the update stands. */
function verLine() {
  const a = state.about; if (!a) return "";
  const st = state.updates ? state.updates.status() : null;
  const where = st === "ready" ? "update ready" : st === "downloading" ? "downloading an update" : st === "checking" ? "checking" : st === "current" ? "up to date" : st === "unknown" ? "could not check" : a.latest === "newer" ? "a newer version is out" : a.latest === "current" ? "up to date" : "";
  return [a.version, where].filter(Boolean).join(" · ");
}
/** What Account says in its line: who is signed in, and where the server copy stands. */
function acctLine(v: ReturnType<NonNullable<typeof state.account>["view"]>) {
  if (!v.person) return "not signed in";
  const { busy, pending, last, error } = v.sync;
  const at = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const where = busy || v.busy === "sync" ? "syncing" : error === "offline" ? "no connection" : error ? "not synced now" : pending ? "changes waiting" : last ? "synced " + at(last) : "not synced yet";
  return "signed in as " + v.person.name + " · " + where;
}
/** The sections. In the real app, on a device with the Magic Key, holding the Version line shows Experiments, and the tap that ends the hold opens nothing. */
function Sections() {
  const hold = useRef(0), held = useRef(false), acct = acctShown() ? state.account!.view() : null, u = state.updates;
  const canHold = !state.preview && !state.expShown && !!state.keyHeld;
  const press = canHold ? {
    onPointerDown: () => { held.current = false; clearTimeout(hold.current); hold.current = window.setTimeout(() => { held.current = true; state.expShown = true; try { localStorage.setItem("rd-exp", "1"); } catch { /* storage blocked */ } render(); pathNote("Experiments are shown"); }, HOLD_MS); },
    onPointerUp: () => clearTimeout(hold.current), onPointerLeave: () => clearTimeout(hold.current), onPointerCancel: () => clearTimeout(hold.current),
    onClickCapture: (e: Event) => { if (held.current) { e.stopPropagation(); held.current = false; } },
  } : {};
  const look = currentLook();
  return <>
    <Group name="General">
      <Line title="Languages" sub={langsLine()} go={() => open("langs")} />
      <Line title="Theme"><Words label="Theme" items={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} cur={look.mode} on={(v) => { setLook({ mode: v === DEFAULT_LOOK.mode ? null : v }); render(); }} /></Line>
    </Group>
    {keyShown() || acct || shareShown() || state.db ? <Group name="Data">
      {keyShown() ? <Line title="Magic Key" icon={state.keyHeld ? "unlocked" : "locked"} sub={state.keyHeld ? "entered on this device" : "not on this device yet"} go={() => open("key")} /> : null}
      {acct ? <Line title="Account" sub={acctLine(acct)} go={() => open("acct")}
        act={acct.person ? { label: "Sync now", busy: acct.busy === "sync", run: () => { void state.account!.syncNow(); } } : undefined} /> : null}
      {shareShown() ? <Line title={"Sharing examples: " + (state.shareExamples ? "on" : "off")} sub="Your examples will help other learners" go={() => open("share")} /> : null}
      {state.db ? <Line title="Export and import" sub="everything this device keeps, in one file" go={() => open("xfer")} /> : null}
    </Group> : null}
    {expOn() ? <Group name="Experiments" tag={state.preview ? "only in previews" : "shown on this device"} note="Not settled yet; not shown in the released app.">
      {voiceAvailable() ? <Line title="Voice features" sub={voiceNote()} sw={{ on: voiceOn(), toggle: () => setVoiceOn(!voiceOn()) }} /> : null}
      <Line title="The lab's settings" sub={labOwn() ? "this device's own" : "the defaults"} go={() => open("lab")} />
    </Group> : null}
    {state.about ? <Group name="About">
      <div {...press}><Line title="Version and updates" sub={verLine()} go={() => open("ver")}
        act={u ? { label: "Check for updates", busy: u.status() === "checking", run: () => u.check() } : undefined} /></div>
    </Group> : null}
  </>;
}
export function SettingsPage() {
  const page = state.optsPage && TITLES[state.optsPage] ? state.optsPage : null;
  // the top bar's chevron is the way back: from a page to Settings, from Settings to where it was opened from
  const up = page ? { label: "Back to Settings", go: back } : { label: state.fromRoad ? "Back to the roadmap" : "Back to the exercise", go: () => toggleOpts(false) };
  return <>
    <TopBar title={page ? TITLES[page]! : "Settings"} back={up} />
    <div class="ppage sfull">
      {page ? <Page id={page} />
        : <><p class="ptitle">Settings</p><Intro>For the app, on this device. How an exercise looks and ticks is in its practice options.</Intro><Sections /></>}
      <div style={{ height: "30px" }} />
    </div>
  </>;
}
