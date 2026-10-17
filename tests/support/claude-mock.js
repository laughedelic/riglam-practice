// A stand-in for the `window.claude` that the Claude artifact frame provides, for specs that load the artifact build:
// `db` keeps its documents in memory and answers like a Firestore collection (the five collections the page stores, plus
// `labruns` from an earlier Quorum, and `flags`), and `sample` is the AI. The reply of `sample` is `window.__reply` when a spec sets
// it, else a short fixed answer in the shape the page parses; `window.__sampleDone` counts the finished calls, so a spec
// can wait for one.
export const CLAUDE_MOCK = `<script>
(() => {
  const NAMES = ["answers", "debates", "batches", "favorites", "skips", "labruns", "flags"];
  const store = Object.fromEntries(NAMES.map((n) => [n, {}]));
  const subs = Object.fromEntries(NAMES.map((n) => [n, []]));
  const snap = (n) => { const docs = Object.entries(store[n]).map(([id, d]) => ({ id, exists: true, data: () => d })); return { docs, size: docs.length, empty: !docs.length }; };
  const push = (n) => setTimeout(() => subs[n].forEach((f) => f(snap(n))), 5);
  const collection = (n) => {
    const q = {
      orderBy: () => q, limit: () => q, where: () => q,
      get: async () => snap(n),
      onSnapshot(f) { subs[n].push(f); setTimeout(() => f(snap(n)), 10); return () => {}; },
      doc: (id) => ({
        set: async (d) => { store[n][id] = d; push(n); },
        update: async (d) => { store[n][id] = Object.assign({}, store[n][id], d); push(n); },
        delete: async () => { delete store[n][id]; push(n); },
      }),
    };
    return q;
  };
  const DEFAULT_REPLY = "Both: a clay pot fits.\\nNeither: a stone is B, not A.";
  window.__sampleDone = 0;
  const sample = async (turns, opts) => {
    const text = window.__reply || DEFAULT_REPLY;
    if (opts && opts.onText) opts.onText({ text: text.slice(0, 12) });
    await new Promise((r) => setTimeout(r, 60));
    window.__sampleDone++;
    return { text, truncated: false };
  };
  window.claude = { use: async (n) => (n === "db" ? { collection, doc: () => collection("answers").doc("x") } : n === "sample" ? sample : null) };
})();
</script>`;
