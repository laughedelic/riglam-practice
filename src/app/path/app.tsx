// The Path's page: one column with the top bar, the screen in front (an exercise, Review, the tutor's conversation, Settings) and the foot,
// and over it the roadmap, the practice options, the question before a skip and the note at the foot. Which screen shows is the classic
// page's state (state.js: tab, view, optsOpen, sessOpen, menuOpen, skipAsk), so Back, the keys and the clocks work as they do there.
// Everything is drawn on the path; an exercise in a state the Path does not draw would show the classic screen, hosted (ui.tsx, Bridge).
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
import { renderSyllogism } from "../syllogism/screen.js";
import { exName } from "../shell/exercises.js";
import { fitPair, isEx, render } from "../shell/render.js";
import { applyLook, currentLook, darkNow, lookClasses } from "./look.ts";
import { OptionsSheet } from "./options.tsx";
import { categoriesScreen } from "./categories.tsx";
import { findScreen } from "./find.tsx";
import { instanceScreen } from "./instance.tsx";
import { pervasionsScreen } from "./pervasions.tsx";
import { relationsScreen } from "./relations.tsx";
import { ReviewPage } from "./review.tsx";
import { Roadmap } from "./roadmap.tsx";
import { aboveSync } from "./scroll.tsx";
import { SettingsPage } from "./settings.tsx";
import { stopScreen } from "./stop.tsx";
import { syllogismScreen } from "./syllogism.tsx";
import { TutorPage } from "./tutor.tsx";
import { PullCtx, Toast, TopBar, turnAside } from "./shell.tsx";
import { Pull } from "./gesture.ts";
import { Bridge, coarse } from "./ui.tsx";

/** What a classic builder appends to a box, as the nodes to host. */
function built(make: (box: HTMLElement, side: HTMLElement) => void): Node[] {
  const box = document.createElement("div"), side = document.createElement("div");
  make(box, side);
  return [...box.childNodes];
}

/** An exercise in a state the Path does not draw (none is expected): the classic screen, with its steps above it and its bar of buttons at its foot. */
function Hosted() {
  const u = state.ui, tab = state.tab;
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
    <TopBar title={exName(tab)} tools />
    <Bridge cls="card" fill={fill} after={() => { fitPair(); placePops(); }} />
  </>;
}
/** "Skip anyway": the question goes, then the page turns aside and the next one arrives (the page was not turned before: it asked first). */
function skipAnyway() {
  state.skipAsk = false; render();
  turnAside(document.querySelector("#path .main"), skipNow);
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
      <div class="acts"><button type="button" class="quiet" onClick={skipAnyway}>Skip anyway</button><button type="button" ref={keep} onClick={closeSkipAsk}>Keep going</button></div>
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
  if (u.stop) return stopScreen(exName(state.tab));     // a course term's stop before the next question (practice/stops.ts)
  if (state.tab === "practice" && !u.debate && !u.find && !u.cats && !u.syllogism && state.cur && state.cur.p) return relationsScreen(kb);
  if (state.tab === "debate" && u.debate && state.cur && state.cur.p) return pervasionsScreen(kb);
  if (state.tab === "find" && u.find) return findScreen(kb);
  if (state.tab === "categories" && u.cats) return categoriesScreen();
  if (state.tab === "instance" && u.inst) return instanceScreen(kb);
  if (state.tab === "syllogism" && u.syllogism && state.cur && state.cur.c) return syllogismScreen(kb);
  return { cls: "", node: <Hosted /> };
}

export function App() {
  const [pull] = useState(() => new Pull()), root = useRef<HTMLDivElement>(null), look = currentLook();
  const [kb, setKb] = useState(false), [small, setSmall] = useState(false), wasChecked = useRef("");
  const s = screen(kb), over = state.menuOpen || (state.sessOpen && isEx() && state.mode === "quiz") || (state.skipAsk && isEx());
  const cls = ["pa", ...lookClasses(look, darkNow(look)), s.cls, kb ? "kbup" : "", kb && small ? "ph-small" : "", state.showAB ? "" : "sj-off"].filter(Boolean).join(" ");
  useLayoutEffect(() => {
    const r = root.current; if (!r) return;
    pull.root = r;
    applyLook(r, look);
    for (const t of r.querySelectorAll<HTMLElement>(".ptail")) t.classList.toggle("long", t.getBoundingClientRect().height > 130);
    aboveSync(r);
    // after a check the station has the focus, so that Enter goes on (as the forward button has it on the classic page)
    const checked = state.ui && state.ui.checked ? (state.ui.stop ? "stop" : "result") : "";     // a term's stop after the result is a screen of its own (path/stop.tsx)
    // (quiet: the app moved the focus there, not a Tab, so no ring is drawn on it, whatever key was pressed before; it goes at the first blur)
    if (checked && checked !== wasChecked.current && !over) {
      const st = r.querySelector<HTMLElement>("#stn");
      if (st) { st.dataset.quiet = "1"; st.addEventListener("blur", () => { delete st.dataset.quiet; }, { once: true }); st.focus({ preventScroll: true }); }
    }
    wasChecked.current = checked;
  });
  useEffect(() => {
    const r = root.current; if (!r) return;
    // the layout with the keyboard up: a field of the path has the focus on a touch screen
    const kbNow = () => { const a = document.activeElement; return !!a && a.classList.contains("pfield") && r.contains(a) && coarse() && currentLook().keys === "sim"; };
    // (while a station is being taken the layout stays as it is: the keyboard goes at the start of the ride, and the page is not to change under it; `after` sets it right)
    const sync = () => { if (!pull.hold) setKb(kbNow()); };
    pull.after = () => setKb(kbNow());
    const fin = () => sync(), fout = () => setTimeout(sync, 0);
    r.addEventListener("focusin", fin); r.addEventListener("focusout", fout);
    const vv = window.visualViewport, size = () => setSmall(!!vv && vv.height < 430);
    if (vv) vv.addEventListener("resize", size); size();
    return () => { pull.after = null; r.removeEventListener("focusin", fin); r.removeEventListener("focusout", fout); if (vv) vv.removeEventListener("resize", size); };
  }, [pull]);
  return <PullCtx.Provider value={pull}>
    <div class={cls} ref={root}>
      <div class="pcol">
        <div class="main" inert={over}>
          {s.node}
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
