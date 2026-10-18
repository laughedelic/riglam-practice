// Ambient types for the page code, which is JavaScript checked with relaxed settings (see tsconfig.json).

// The page finds elements with querySelector and document.activeElement and treats them all as HTML elements
// (focus, blur, style). Typing Element that way keeps the checker from asking for a cast at each of those calls.
interface Element extends HTMLOrSVGElement, ElementCSSInlineStyle {}

// Defined by a test before the page runs; the page hands it its internals (the end of app.js).
interface Window {
  __riglamTest?: (hook: Record<string, unknown>) => void;
  // What the start is waiting for, and why it failed: read by the recovery panel of the PWA page (index.html).
  __riglamWaiting?: () => string;
  __riglamFailed?: string;
}
