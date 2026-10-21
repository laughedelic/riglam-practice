// Vite plugin for the artifact build: `import text from "virtual:riglam-full-data"` is the full term data as JSON
// text, made by putting the definitions and notes back into the open data. The artifact is private to its owner and
// its tutor reads the notes, so it carries everything. The build needs the course data (data-private/,
// docs/DATA.md) and stops without it: a page published with locked definitions would replace the real one. The reference examples
// (`virtual:riglam-examples`, the part a device with the Magic Key keeps) are embedded when data-private/ has them.
import { hasCourse, hasExamples, readExamples, readFull } from "./lib/course-files.mjs";

const ID = "virtual:riglam-full-data";
const EXAMPLES_ID = "virtual:riglam-examples";

export function fullData() {
  return {
    name: "riglam-full-data",
    resolveId: (id) => (id === ID || id === EXAMPLES_ID ? `\0${id}` : null),
    async load(id) {
      // the reference examples are optional: the device part as JSON text, or null in a checkout that has none
      if (id === `\0${EXAMPLES_ID}`) {
        for (const f of ["data-private/examples.json", "data-private/examples-device.json"]) this.addWatchFile(new URL(`../${f}`, import.meta.url).pathname);
        return `export default ${hasExamples() ? JSON.stringify(JSON.stringify(readExamples().device)) : "null"};`;
      }
      if (id !== `\0${ID}`) return null;
      if (!hasCourse()) throw new Error("the artifact build needs the course data: data-private/definitions.json and notes.json (npm run data:import, or data:fixture for made-up text; docs/DATA.md)");
      const full = readFull();
      for (const f of ["src/data/drill-data.json", "data-private/definitions.json", "data-private/notes.json"]) this.addWatchFile(new URL(`../${f}`, import.meta.url).pathname);
      return `export default ${JSON.stringify(JSON.stringify(full))};`;
    },
  };
}
