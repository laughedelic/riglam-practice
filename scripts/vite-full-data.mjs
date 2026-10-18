// Vite plugin for the artifact build: `import text from "virtual:riglam-full-data"` is the full term data as JSON
// text, made by putting the definitions and notes back into the open data. The artifact is private to its owner and
// its tutor reads the notes, so it carries everything. The build needs the course data (data-private/,
// docs/DATA.md) and stops without it: a page published with locked definitions would replace the real one.
import { hasCourse, readFull } from "./lib/course-files.mjs";

const ID = "virtual:riglam-full-data";

export function fullData() {
  return {
    name: "riglam-full-data",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    async load(id) {
      if (id !== `\0${ID}`) return null;
      if (!hasCourse()) throw new Error("the artifact build needs the course data: data-private/definitions.json and notes.json (npm run data:import, or data:fixture for made-up text; docs/DATA.md)");
      const full = readFull();
      for (const f of ["src/data/drill-data.json", "data-private/definitions.json", "data-private/notes.json"]) this.addWatchFile(new URL(`../${f}`, import.meta.url).pathname);
      return `export default ${JSON.stringify(JSON.stringify(full))};`;
    },
  };
}
