// The two lookup tools the tutor can call while it answers: a term in the course data, and an example in the practice
// list (or, where the server has them, the course's reference examples). A tool works on a data index, so the page runs it
// on its own state and the Worker on an index it builds.
import { exampleFacts, matchExamples } from "./examples";
import type { ExampleIndex } from "./examples";
import { termFacts } from "./facts";
import { matchItem, spelled } from "./lookup";
import type { DataIndex } from "./lookup";

/** A tool in the shape the `sample` capability takes (and the Messages API: name, description, JSON schema). */
export interface TutorTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** the result is serialized for the model; an error is reported to it as the tool result */
  execute: (input: unknown) => unknown;
}

const CLASSIFY = "Check how the practice list classifies a concrete thing (e.g. 'a dog', 'the smell of coffee'). Returns its Dudra type and the practice categories it belongs to, or found:false if the list does not contain it.";
const CLASSIFY_REFERENCE = "Check how the practice list, or else the course's reference examples, classify a concrete thing (e.g. 'a dog', 'the smell of coffee'). From the list: its Dudra type and the practice categories it belongs to. From the reference examples (source: \"reference\"): the classes it is an instance of, each with its chain up to Existent, the classes it is not, its level (1 plain to 4), kind, how well the sources confirm it, and why it is a good example; when two examples share the name, both, marked ambiguous. found:false when neither has it.";

/** The tools on the data index; `examples`, the reference examples where the caller has them, is where classify_example looks after the practice list. */
export function tutorTools(ix: DataIndex, examples?: ExampleIndex | null): TutorTool[] {
  return [
    {name:"lookup_term", description:"Look up a Dudra term in the course booklet's term data. Returns its definition (English, Russian), chapter, place in the hierarchy, mutually inclusive and contradictory terms, the terms it is included in (three possibilities), the terms it has four possibilities with, and the knowledge base's note. Use it for any term not on the card.",
     inputSchema:{type:"object",properties:{name:{type:"string",description:"Term in English, e.g. 'Non-associated compositional factor', or in Russian"}},required:["name"]},
     execute:(input)=>{
       const q=spelled((input as {name?: unknown}|null|undefined)?.name); if(!q) throw new Error("empty name");
       const ts=Object.values(ix.DATA.terms);
       const hit=ts.find(t=>spelled(t.name)===q)||ts.find(t=>(t.aliases||[]).some(a=>spelled(a)===q))||ts.find(t=>spelled(t.ru)===q)||ts.find(t=>spelled(t.name).includes(q));
       if(!hit) return {found:false, close:ts.filter(t=>spelled(t.name).split(" ").some(w=>q.includes(w)&&w.length>3)).slice(0,8).map(t=>t.name)};
       return Object.assign({found:true}, termFacts(ix,hit.name));
     }},
    {name:"classify_example", description:examples?CLASSIFY_REFERENCE:CLASSIFY,
     inputSchema:{type:"object",properties:{thing:{type:"string"}},required:["thing"]},
     execute:(input)=>{
       const thing=(input as {thing?: unknown}|null|undefined)?.thing;
       const it=matchItem(ix,thing);
       if(it) return {found:true, item:it.n, existent:!it.ne, dudra_type:it.t, chain:(ix.DATA.chains[it.t]||[it.t]).join(" > "), categories:it.c.map(c=>ix.CAT[c].labels[0])};
       const refs=examples?matchExamples(examples,thing):[];
       if(!refs.length) return {found:false};
       if(refs.length===1) return {found:true, source:"reference", ...exampleFacts(ix,refs[0])};
       return {found:true, source:"reference", ambiguous:true, candidates:refs.slice(0,4).map(r=>exampleFacts(ix,r))};
     }},
  ];
}
