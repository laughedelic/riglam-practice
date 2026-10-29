// Checks the pieces that need no model: the kit builds from data-private/, every case builds, and the grader reads a known answer as expected.
import { existsSync, readFileSync } from "node:fs";
import DATA from "../../src/data/drill-data.json";
import { kitFrom } from "../../worker/kit";
import { loadCases } from "./load";
import { gradeReply } from "./grade";
import { splitOf } from "./split";

const kit = await kitFrom(DATA, {
  definitions: readFileSync("data-private/definitions.json", "utf8"),
  notes: readFileSync("data-private/notes.json", "utf8"),
  examples: existsSync("data-private/examples-device.json") ? readFileSync("data-private/examples-device.json", "utf8") : null,
});
console.log("kit tools:", kit.tools.map((t) => t.name).join(", "));
console.log("classify 'a dream':", JSON.stringify(kit.run("classify_example", { example: "a dream" })).slice(0, 200));
const cases = loadCases();
console.log("cases:", cases.length, "test:", cases.filter((c) => splitOf(c.id) === "test").length);
const c = cases.find((x) => x.pair.catA === "black" && x.pair.catB === "tree")!;
// the answer of the 24 Oct flag, which said "class: none" and, for the black oak, A yes B yes
const reply = `Both: "a black oak" | class: none | A yes: its color is black | B yes: it is a tree
A not B: "a black shoe" | class: none | A yes: its color is black | B no: it is leather footwear
B not A: "a birch" | class: none | A no: its bark is white | B yes: it is a tree
Neither: "a red car" | class: none | A no: its color is red | B no: it is a metal vehicle
Common locus: wait, yes.
Pervasion: neither one covers the other.`;
const g = gradeReply(c, reply);
console.log(JSON.stringify(g.examples.map((e) => [e.text, e.a, e.b, e.said, e.shown, e.fitRight])));
console.log(JSON.stringify(g.form));
