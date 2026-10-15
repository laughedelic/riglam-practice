// The Magic Key: a few random words that the study group shares (docs/DATA.md), typed or dictated, in any case, with spaces,
// dashes or the punctuation a dictation adds, or taken from the link (`#k=lotus-river-candle-stone`). Everywhere it is used it
// is the same text: lower-case words joined by dashes. The server holds it as the secret RIGLAM_DATA_KEY and checks proofs made
// with it (./proof.ts); the page keeps it on the device. Pure functions, no DOM: the page, the Worker, the scripts and the tests share it.

/** Fewest and most words a Magic Key can have. */
export const MAGIC_WORDS = { min: 3, max: 12 } as const;

/** The Magic Key in `input` (typed words, or a link or fragment carrying `k=`), as dashed lower-case words; null when it is not shaped like one. */
export function parseMagicKey(input: unknown): string | null {
  const s = String(input ?? "").trim();
  const fragment = /(?:^|[#&?])k=([^&#\s]*)/.exec(s);
  let part = s;
  if (fragment) {
    try {
      part = decodeURIComponent(fragment[1]);
    } catch {
      return null;
    }
  } else if (/[:/#?=]/.test(s)) return null; // a link that carries no key
  if (/[0-9_]/.test(part)) return null; // the words have neither digits nor underscores
  const words = part.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length >= MAGIC_WORDS.min && words.length <= MAGIC_WORDS.max ? words.join("-") : null;
}
