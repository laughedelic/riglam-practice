// The open term data as the Worker script carries it. Only worker/index.ts imports this, so that the tests, which build their
// own data, never need the real file. The course part (definitions and notes) is in the database, not in the script.
import openData from "../src/data/drill-data.json";

export const bundled: object = openData;
