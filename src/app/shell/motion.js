import { state } from "../state.js";

/* ---------- motion ---------- */
// Whether the page moves between its screens (the slides of the Path, path/shell.tsx). The state never waits for the motion. Nothing moves
//  - under reduced motion,
//  - before the first screen has been drawn,
//  - when the browser animated the Back itself (the swipe from the edge, `hasUAVisualTransition`): it has just animated the screen away, a second motion on top of it would be two.
//    (A Back it did not animate, the button or the key, plays the panel's own motion like any other close.)
export const moves=()=>state.motion&&!state.navBack&&!matchMedia("(prefers-reduced-motion: reduce)").matches;
