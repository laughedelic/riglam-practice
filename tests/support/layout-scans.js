// In-page layout checks for the layout specs. `scanPage` runs in the browser (Playwright serializes it, so it must not use anything
// outside its own body) and returns a list of findings, one string each; an empty list is a clean screen. Five kinds:
//   PAGE     the document is wider than the window, so the page would scroll sideways
//   SCROLLX / CLIPX   an element that scrolls or clips sideways has content wider than itself (skipped: an input, which scrolls its text; an element that
//            ends its text with an ellipsis on purpose; text for screen readers only, a pixel big)
//   EDGE     a popup, sub-line, timer row, map or top-bar part, or anything in the Terms panel, sticks out of the window
//   OUT      a button or field sticks out of the nearest container that clips it (or out of the window)
//   RING     the 4 px focus ring of a control would be cut by a container that clips sideways (a control needs 4 px of room; one that sets the custom
//            property --ring-inset to 1 draws its ring inside itself and is skipped)
// `wideFields` makes every text field much wider by default, as a font with wide letters would: nothing may then pass its container.
export function scanPage({ wideFields = 0 } = {}) {
  const found = [];
  const name = (n) => n.tagName + (n.className && n.className.baseVal === undefined && String(n.className).trim() ? "." + String(n.className).trim().split(/\s+/)[0] : "") + (n.id ? "#" + n.id : "");
  const shown = (n) => { const cs = getComputedStyle(n), r = n.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
  const W = innerWidth, de = document.documentElement;

  if (wideFields) document.querySelectorAll("input").forEach((i) => { if (!/checkbox|radio|range|hidden/.test(i.type)) i.size = wideFields; });

  if (de.scrollWidth > W + 0.5) found.push(`PAGE scrollWidth ${de.scrollWidth} > ${W}`);

  for (const n of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(n);
    if (cs.display === "none" || n.tagName === "INPUT" || cs.textOverflow === "ellipsis") continue;
    const r = n.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) continue; // nothing, or text for screen readers only (.sr)
    const wider = n.scrollWidth > n.clientWidth + 0.5 && n.clientWidth > 0;
    const kind = !wider ? "" : /(auto|scroll)/.test(cs.overflowX) ? "SCROLLX" : /hidden|clip/.test(cs.overflowX) ? "CLIPX" : "";
    if (!kind) continue;
    // name the element that reaches furthest to the right, so the finding says what to fix
    let far = null;
    for (const c of n.querySelectorAll("*")) { const cr = c.getBoundingClientRect(); if (cr.width > 1 && (!far || cr.right > far.right)) far = { c, right: cr.right }; }
    found.push(`${kind} ${name(n)} ${n.scrollWidth}/${n.clientWidth}${far ? ` (reaches ${Math.round(far.right)}: ${name(far.c)})` : ""}`);
  }

  for (const n of document.querySelectorAll(".pop,.subrow,.trow,.cmap,.mbar *,.terms *")) {
    const r = n.getBoundingClientRect();
    if (r.width && (r.right > W + 1 || r.left < -1)) found.push(`EDGE ${name(n)} left ${Math.round(r.left)} right ${Math.round(r.right)} of ${W}`);
  }

  for (const n of document.querySelectorAll("button,input,textarea,select")) {
    if (!shown(n)) continue;
    const b = n.getBoundingClientRect();
    let p = n.parentElement;
    while (p && p !== document.body && getComputedStyle(p).overflowX === "visible") p = p.parentElement;
    const pr = p && p !== document.body ? p.getBoundingClientRect() : { left: 0, right: W };
    if (b.right > pr.right + 0.5 || b.left < pr.left - 0.5) found.push(`OUT ${name(n)} in ${p && p !== document.body ? name(p) : "body"} right ${Math.round(b.right - pr.right)} left ${Math.round(pr.left - b.left)}`);
  }

  const focusable = [...document.querySelectorAll("button,input,select,textarea,summary,[tabindex]")].filter((n) => shown(n) && n.tabIndex >= 0 && !n.disabled);
  for (const n of focusable) {
    if (getComputedStyle(n).getPropertyValue("--ring-inset").trim() === "1") continue; // draws its focus ring inside itself
    const r = n.getBoundingClientRect();
    for (let a = n.parentElement; a && a !== de; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (!/hidden|clip|auto|scroll/.test(cs.overflowX)) continue;
      const b = a.getBoundingClientRect(), L = b.left + parseFloat(cs.borderLeftWidth), R = b.right - parseFloat(cs.borderRightWidth);
      // only when the control is inside the visible part of the container vertically
      if (r.bottom > b.top && r.top < b.bottom && (r.left - 4 < L - 0.5 || r.right + 4 > R + 0.5)) {
        found.push(`RING ${name(n)} "${(n.textContent || n.placeholder || "").trim().slice(0, 18)}" in ${name(a)} room left ${Math.round(r.left - L)} right ${Math.round(R - r.right)}`);
      }
    }
  }

  return [...new Set(found)].slice(0, 8);
}
