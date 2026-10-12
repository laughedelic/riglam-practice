// Vite plugin for the artifact build: `import text from "virtual:riglam-full-data"` is the full term data as JSON
// text, made by putting the definitions and notes back into the open data. The artifact is private to its owner and
// its tutor and check lab read the notes, so it carries everything. The build needs the data key and stops without it:
// a page published with locked definitions would replace the real one.
import { readFull, requireKey } from "./lib/course-files.mjs";

const ID = "virtual:riglam-full-data";

export function fullData() {
  return {
    name: "riglam-full-data",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    async load(id) {
      if (id !== `\0${ID}`) return null;
      const full = await readFull(requireKey("the artifact build"));
      for (const f of ["drill-data.json", "course-definitions.enc", "course-notes.enc"]) this.addWatchFile(new URL(`../src/data/${f}`, import.meta.url).pathname);
      return `export default ${JSON.stringify(JSON.stringify(full))};`;
    },
  };
}
