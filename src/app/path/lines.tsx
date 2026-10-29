// The lines of the practice options and of Settings (the Design Lab's "Settings and options", round 3): a group under a small heading, and in it lines of
// [the switch] [the name, with its value or a quick choice under it] [the chevron into its page]. The whole line is the way in, a button under the rest, so a
// tap almost anywhere opens its page; only the switch, the quick choice and what a page line holds keep their own taps. A line with a switch and no page is
// the switch, all of it. 46-path-settings.css.
import type { ComponentChildren } from "preact";
import { Icon, Toggle } from "./ui.tsx";

export interface LineProps {
  title: string;
  /** a tag after the name: "experimental" */
  tag?: string;
  /** what it is set to, in a few words, under the name */
  sub?: ComponentChildren;
  /** it can be on or off: the switch left of the name */
  sw?: { on: boolean; toggle: () => void };
  /** an action in the switch's place (sync now, check for updates), with a turning arrow while it runs */
  act?: { label: string; busy?: boolean; run: () => void };
  /** a choice under the name in place of the summary, or what a line of a page holds (buttons, a sample) */
  children?: ComponentChildren;
  /** its own page */
  go?: () => void;
}

/** One line. */
export function Line({ title, tag, sub, sw, act, children, go }: LineProps) {
  const hit = go || (sw ? sw.toggle : undefined);
  return <div class={"ol" + (go ? " olgo" : "") + (sw && !sw.on ? " off" : "")}>
    {hit ? <button type="button" class="olhit" aria-label={go ? title + ": more" : undefined} tabIndex={go ? 0 : -1} aria-hidden={go ? undefined : "true"} onClick={hit} /> : null}
    {sw ? <button type="button" class="olsw" role="switch" aria-checked={sw.on ? "true" : "false"} aria-label={title} onClick={sw.toggle}><Toggle on={sw.on} /></button>
      : act ? <button type="button" class={"olsw olact" + (act.busy ? " busy" : "")} aria-label={act.label} onClick={act.run}><Icon n="refresh" /></button>
      : <span class="olsw" />}
    <span class="oltx"><b>{title}{tag ? <em class={"oltag" + (tag === "experimental" ? " exp" : "")}>{tag}</em> : null}</b>
      {sub ? <small>{sub}</small> : null}
      {children ? <span class="olbody">{children}</span> : null}</span>
    {go ? <span class="olchev" aria-hidden="true"><Icon n="chev" /></span> : <span />}
  </div>;
}

/** A group of lines under its heading (none for the last group, the way on to Settings). */
export const Group = ({ name, tag, note, children }: { name?: string; tag?: string; note?: string; children?: ComponentChildren }) =>
  <section class={"sgrp" + (name ? "" : " sgend")}>
    {name ? <h4 class="sgh">{name}{tag ? <em class="oltag exp">{tag}</em> : null}</h4> : null}
    {note ? <p class="sgnote">{note}</p> : null}
    {children}
  </section>;

/** The words at the head of a page. */
export const Intro = ({ children }: { children?: ComponentChildren }) => <p class="sintro">{children}</p>;
