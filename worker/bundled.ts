// The term data as the Worker script carries it: the open file and the two encrypted course files, which wrangler bundles
// (`rules` in wrangler.jsonc makes .enc files binary imports). Only worker/index.ts imports this, so that the tests,
// which build their own data, never need the .enc files to be importable.
import openData from "../src/data/drill-data.json";
import definitions from "../src/data/course-definitions.enc";
import notes from "../src/data/course-notes.enc";
import type { Sources } from "./kit";

export const bundled: Sources = { open: openData, definitions, notes };
