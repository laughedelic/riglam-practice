// The clock of Sprint: a line on the lower edge of the top bar that fills over the step's time; when it is full the step moves on by itself. With a field in focus on a phone the top bar steps aside (07-path-station.css) and the line stays, at the
// top of the screen, so that the clock is in sight while an example is written. In the last seconds, when most of the line is filled, it turns red and says the seconds left in a number.
import { useEffect, useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { beatStage } from "../../domain/sprint.ts";

/** A countdown that is running: when it began (`performance.now()`) and how long it lasts (ms). */
export interface Tq { t0: number; limit: number }
const reduced = (): boolean => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/**
 * The line and, in the last seconds, the number. A countdown is one bar: the caller keys it by the countdown's start, so a new countdown starts from full. The bar is an
 * animation that begins where the countdown stands when the bar is drawn; that offset is taken once, because a redraw (each letter typed is one) that changed it
 * would move a running animation ahead by the time already gone. With reduced motion the page has no animation: the bar steps up once a second instead.
 */
export function Clock({ tq, late }: { tq: Tq; late: boolean }) {
  const from = useRef(-1);
  if (from.current < 0) from.current = Math.max(0, Math.round(performance.now() - tq.t0));
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(id); }, []);
  const u = state.ui, held = u && u.hold ? u.hold.spent as number : null;     // a clock held for a spoken answer stands still (debate/flow.js)
  const gone = held !== null ? held : performance.now() - tq.t0, left = Math.max(0, tq.limit - gone);
  const stage = beatStage(left, tq.limit), low = stage > 0, hot = stage > 1, hotter = stage > 2;      // the last seconds, in three stages (domain/sprint.ts)
  const step = reduced() ? Math.min(1, Math.floor(gone / 1000) * 1000 / tq.limit) : null;
  return <div class="pclk" aria-hidden="true">
    <div class={"pclock" + (late ? " late" : "") + (low ? " low" : "") + (hot ? " hot" : "") + (hotter ? " hotter" : "")} style={{ "--t": tq.limit + "ms", "--e": from.current + "ms" }}><i style={step === null ? undefined : { transform: "scaleX(" + step.toFixed(3) + ")" }} /></div>
    {low ? <b class="pclk-s">{Math.max(1, Math.ceil(left / 1000))}</b> : null}
  </div>;
}
