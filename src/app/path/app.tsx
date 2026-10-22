// The Path's page: one column with the top bar, the screen in front (an exercise, Review, the tutor's conversation, Settings) and the foot,
// and over it the roadmap, the practice options, the question before a skip and the note at the foot. Which screen shows is the classic
// page's state (state.js: tab, view, optsOpen, sessOpen, menuOpen, skipAsk), so Back, the keys and the clocks work as they do there.
// Relations is drawn on the path; the other exercises, Review and the tutor's conversation are the classic page's, hosted (ui.tsx, Bridge).
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { renderCategories } from "../categories/screen.js";
import { renderDebate } from "../debate/screen.js";
import { renderFind } from "../find/screen.js";
import { placePops, renderQuiz } from "../practice/screen.js";
import { closeSkipAsk, skipInto, skipNow } from "../practice/skips.js";
import { renderReview } from "../review/review.js";
import { renderSyllogism } from "../syllogism/screen.js";
import { chatInto, closeChat, openChat } from "../shell/chat.js";
import { exName } from "../shell/exercises.js";
import { fitPair, isEx } from "../shell/render.js";
import { setTab } from "../shell/tabs.js";
import { applyLook, currentLook, darkNow, lookClasses } from "./look.ts";
import { OptionsSheet } from "./options.tsx";
import { relationsScreen } from "./relations.tsx";
import { Roadmap } from "./roadmap.tsx";
import { aboveSync } from "./scroll.tsx";
import { SettingsPage } from "./settings.tsx";
import { Foot, PullCtx, Station, Toast, TopBar } from "./shell.tsx";
import { Pull } from "./gesture.ts";
import { Bridge, coarse } from "./ui.tsx";

/** What a classic builder appends to a box, as the nodes to host. */
function built(make: (box: HTMLElement, side: HTMLElement) => void): Node[] {
  const box = document.createElement("div"), side = document.createElement("div");
  make(box, side);
  return [...box.childNodes];
}
const waitingAnswer = () => { const u = state.ui; return !!u && !!u.chat && u.chat.some((t: { role: string; pending?: boolean; content?: string }) => t.role === "assistant" && !t.pending && t.content); };

/** An exercise the Path does not draw yet: the classic screen, with its steps above it and its bar of buttons at its foot. */
function Hosted() {
  const u = state.ui, tab = state.tab, ai = canAsk() && !(u && u.cats);
  const fill = () => {
    const st = $("steps"); st.replaceChildren(); st.hidden = true;
    const nodes = built((s, c) => {
      if (tab === "debate" && u && u.debate) renderDebate(s, c);
      else if (tab === "find" && u && u.find) renderFind(s, c);
      else if (tab === "categories" && u && u.cats) renderCategories(s, c);
      else if (tab === "syllogism" && u && u.syllogism) renderSyllogism(s, c);
      else renderQuiz(s, c);
    });
    const steps = st.hidden ? null : el("nav", { class: "steps", "aria-label": "Steps" }, ...st.childNodes);
    return [steps, ...nodes];
  };
  return <>
    <TopBar title={exName(tab)} tools tutor={ai && u && (u.checked || u.chat) ? openChat : null} tutorDot={waitingAnswer()} />
    <Bridge cls="card" fill={fill} after={() => { fitPair(); placePops(); }} />
  </>;
}
function ReviewPage() {
  return <>
    <TopBar title="Review" />
    <Bridge cls="card rv" fill={() => built((s) => renderReview(s))} />
    <Foot><Station name={"Back to " + exName(state.own)} act={() => setTab(state.own)} /></Foot>
  </>;
}
/** The tutor's conversation: what it is about, the question field (or Stop), the newest exchange first. */
function TutorPage() {
  const fill = () => {
    const box = document.createElement("div"); chatInto(box);
    const d = box.querySelector(".cdrawer"); if (!d) return [];
    d.querySelector(".oh")?.remove();
    return [...d.childNodes];
  };
  return <>
    <TopBar title="The tutor" />
    <Bridge cls="ptalk" fill={fill} />
    <Foot><Station name="Back to the result" hint={exName(state.tab)} act={closeChat} /></Foot>
  </>;
}
/** The question before an attempt with something in it is set aside; its words are the classic page's (practice/skips.js). */
function SkipAsk() {
  const box = document.createElement("div"); skipInto(box);
  const q = box.querySelector("h2")?.textContent || "Skip?", d = box.querySelector(".dlg p")?.textContent || "";
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => { keep.current?.focus({ preventScroll: true }); }, []);
  return <>
    <button type="button" class="scrim on" tabIndex={-1} aria-label="Keep going" onClick={closeSkipAsk} />
    <div class="pdlg" role="alertdialog" aria-modal="true" aria-labelledby="pskq" aria-describedby="pskd">
      <h2 id="pskq">{q}</h2><p id="pskd">{d}</p>
      <div class="acts"><button type="button" class="quiet" onClick={skipNow}>Skip anyway</button><button type="button" ref={keep} onClick={closeSkipAsk}>Keep going</button></div>
    </div>
  </>;
}
const Status = ({ text }: { text: string }) => <><TopBar title="Riglam" /><p class="pstatus" role="status">{text}</p></>;

/** The screen in front, and the classes it gives the root (Relations: ready to check, done). */
function screen(kb: boolean): { cls: string; node: ComponentChildren } {
  if (state.mode === "loading") return { cls: "", node: <Status text="Loading." /> };
  if (state.mode === "nodata") return { cls: "", node: <Status text="The practice data could not be loaded. Reload the page to try again." /> };
  if (state.optsOpen) return { cls: "", node: <SettingsPage /> };
  if (state.tab === "review") return { cls: "", node: <ReviewPage /> };
  if (state.mode !== "quiz" || !isEx() || !state.ui) return { cls: "", node: <Status text="" /> };
  if (state.view === "chat" && (state.ui.chat || state.ui.checked) && canAsk()) return { cls: "", node: <TutorPage /> };
  const u = state.ui;
  if (state.tab === "practice" && !u.debate && !u.find && !u.cats && !u.syllogism && state.cur && state.cur.p) return relationsScreen(kb);
  return { cls: "", node: <Hosted /> };
}

export function App() {
  const [pull] = useState(() => new Pull()), root = useRef<HTMLDivElement>(null), look = currentLook();
  const [kb, setKb] = useState(false), [small, setSmall] = useState(false), wasChecked = useRef(false);
  const s = screen(kb), over = state.menuOpen || (state.sessOpen && isEx() && state.mode === "quiz") || (state.skipAsk && isEx());
  const cls = ["pa", ...lookClasses(look, darkNow(look)), s.cls, kb ? "kbup" : "", kb && small ? "ph-small" : "", state.ui && state.ui.ctl ? "pthink" : ""].filter(Boolean).join(" ");
  useLayoutEffect(() => {
    const r = root.current; if (!r) return;
    pull.root = r;
    applyLook(r, look);
    for (const t of r.querySelectorAll<HTMLElement>(".ptail")) t.classList.toggle("long", t.getBoundingClientRect().height > 130);
    aboveSync(r);
    // after a check the station has the focus, so that Enter goes on (as the forward button has it on the classic page)
    const checked = !!(state.ui && state.ui.checked);
    if (checked && !wasChecked.current && !over) { const st = r.querySelector<HTMLElement>("#stn"); if (st) st.focus({ preventScroll: true }); }
    wasChecked.current = checked;
  });
  useEffect(() => {
    const r = root.current; if (!r) return;
    // the layout with the keyboard up: a field of the path has the focus on a touch screen
    const kbNow = () => { const a = document.activeElement; return !!a && a.classList.contains("pfield") && r.contains(a) && coarse() && currentLook().keys === "sim"; };
    const sync = () => setKb(kbNow());
    const fin = () => sync(), fout = () => setTimeout(sync, 0);
    r.addEventListener("focusin", fin); r.addEventListener("focusout", fout);
    const vv = window.visualViewport, size = () => setSmall(!!vv && vv.height < 430);
    if (vv) vv.addEventListener("resize", size); size();
    return () => { r.removeEventListener("focusin", fin); r.removeEventListener("focusout", fout); if (vv) vv.removeEventListener("resize", size); };
  }, []);
  return <PullCtx.Provider value={pull}>
    <div class={cls} ref={root}>
      <div class="pcol">
        <div class="main" inert={over}>
          {s.node}
          <div class="bumpl" aria-hidden="true"><b>pull past the line</b></div>
          <div class="riser" aria-hidden="true" />
        </div>
        <OptionsSheet />
        <Roadmap />
        {state.skipAsk && isEx() && state.mode === "quiz" ? <SkipAsk /> : null}
        <Toast />
      </div>
    </div>
  </PullCtx.Provider>;
}
