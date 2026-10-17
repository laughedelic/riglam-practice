import { state } from "../state.js";
import { L, el } from "../core/dom.js";
import { NOT, QCELL, QMINE, qPlain } from "../../ai-shared/debate.ts";
import { american } from "../../ai-shared/lookup.ts";

/* ---------- debate: the four questions ---------- */
// The learner is the defender. The challenger asks four questions about A and B; each is answered Accept or Why?
// (then posit an example). Each question has one counter-example cell of the practice grid:
//   Q1 if it is A, it follows it is not B  -> a thing that is both
//   Q2 if it is A, it follows it is B      -> an A that is not B
//   Q3 if it is B, it follows it is A      -> a B that is not A
//   Q4 if it is not A, it follows it is B  -> a thing that is neither (plain form: a non-existent counts)
// "Accept" is right when that cell has nothing; "Why?" is right when it has something, and then the example is checked.
// The cells and the canonical wording of the four questions ("mine", with the letters A and B: what the tutor card and the
// Review tab use) are in src/ai-shared, where the tutor card is built.
export { QCELL, qPlain };
// How the challenger's statement is worded and answered; which form the class uses is Alexey's pick (see notes/debate-question-form.md).
// The saved data and the tutor card keep the same four questions whatever the wording. "A" and "B" become the pair's own terms,
// and N marks a "not" that the page emphasizes.
const N=NOT;
export const WORDINGS={
  mine:{name:"Statement",lead:"Do you accept that…",acc:"Accept",acm:"\u2713 ",acd:"Accepted",why:"Why?",wyd:"Why?!",ak:"A",wk:"W",q:QMINE},
  cons:{name:"Consequence",lead:"Do you accept that…",acc:"I accept",acm:"\u2713 ",acd:"Accepted",why:"Why?",wyd:"Why?!",ak:"A",wk:"W",q:[["It follows that whatever is ","A"," is necessarily ",N," ","B","."],["It follows that whatever is ","A"," is necessarily ","B","."],["It follows that whatever is ","B"," is necessarily ","A","."],["It follows that whatever is ",N," ","A"," is necessarily ","B","."]]},
  plain:{name:"Plain",lead:"",acc:"Yes",acd:"Yes",why:"No",wyd:"No",ak:"Y",wk:"N",q:[["Is whatever is ","A"," necessarily ",N," ","B","?"],["Is whatever is ","A"," necessarily ","B","?"],["Is whatever is ","B"," necessarily ","A","?"],["Is whatever is ",N," ","A"," necessarily ","B","?"]]}
};
// Each label of the 42 categories in the singular, with its article, so the questions read as a real debate would.
// Keys are American (the data is); a label saved by an older version in the British spelling is looked up through american().
const SING={"functional things":"a functional thing","impermanent things":"an impermanent thing","composed things":"a composed thing","products":"a product","causes":"a cause","effects":"an effect","things that change":"a thing that changes","things that arise from causes":"a thing that arises from causes","momentary things":"a momentary thing","things that disintegrate":"a thing that disintegrates","things able to perform a function":"a thing able to perform a function","manifest phenomena":"a manifest phenomenon",
"permanent phenomena":"a permanent phenomenon","non-produced phenomena":"a non-produced phenomenon","uncomposed phenomena":"an uncomposed phenomenon","things that do not change moment by moment":"a thing that does not change moment by moment",
"forms":"a form","physical things":"a physical thing","matter":"matter","things made of atoms":"a thing made of atoms","external forms":"an external form","physical things outside a person's continuum":"a physical thing outside a person's continuum","internal forms":"an internal form","sense powers":"a sense power",
"colors":"a color","hues":"a hue","shapes":"a shape","visible forms":"a visible form","objects of eye consciousness":"an object of eye consciousness","sounds":"a sound","things heard by the ear consciousness":"a thing heard by the ear consciousness","smells":"a smell","odors":"an odor","objects of nose consciousness":"an object of nose consciousness","tastes":"a taste","objects of tongue consciousness":"an object of tongue consciousness","tangible objects":"a tangible object","objects of body consciousness":"an object of body consciousness",
"consciousnesses":"a consciousness","minds":"a mind","awarenesses":"an awareness","knowers":"a knower","sense consciousnesses":"a sense consciousness","sense perceptions":"a sense perception","eye consciousnesses":"an eye consciousness","acts of seeing":"an act of seeing","mental consciousnesses":"a mental consciousness",
"non-associated compositional factors":"a non-associated compositional factor","impermanent things that are neither matter nor mind":"an impermanent thing that is neither matter nor mind","persons":"a person","sentient beings":"a sentient being","hidden phenomena":"a hidden phenomenon","expressive sounds":"an expressive sound","sounds that express a meaning":"a sound that expresses a meaning",
"wooden things":"a wooden thing","metal things":"a metal thing","white things":"a white thing","red things":"a red thing","green things":"a green thing","round things":"a round thing","square things":"a square thing","liquids":"a liquid","food":"food","things you can eat":"a thing you can eat","drinks":"a drink","hot things":"a hot thing","furniture":"furniture","musical instruments":"a musical instrument","plants":"a plant","bodies and body parts":"a body or a body part","animals":"an animal","humans":"a human","emotions":"an emotion","feelings":"a feeling","memories":"a memory","thoughts":"a thought","dreams":"a dream",
/* labels of older prepared pairs */
"permanent things":"a permanent thing","things that are produced":"a thing that is produced","things that exist":"a thing that exists","things that can be known":"a thing that can be known","things that can be heard":"a thing that can be heard","things that have causes":"a thing that has causes","things with color":"a thing with color","hard things":"a hard thing","cold things":"a cold thing","muscles":"a muscle","people":"a person","monks":"a monk","tables":"a table","bodies":"a body","mental factors":"a mental factor","dogs":"a dog","instruments":"an instrument"};
try{ const v=localStorage.getItem("rd-wording"); if(WORDINGS[v]) state.wording=v; }catch(e){}
export const Wd=()=>WORDINGS[state.wording];
// the chip and the first word of its term stay on one line
/** A category label in the singular, with its article ("memories" -> "a memory"). */
export const singular=lab=>SING[american(lab)]||lab.replace(/^(\w+) things$/,"a $1 thing");
export const termNode=x=>{ const lab=x==="A"?state.cur.p.a:state.cur.p.b, [w,...r]=singular(lab).split(" ");
  return el("span",{class:"qterm"},el("span",{class:"keep"},state.showAB?[L(x)," "]:null,el("span",{class:"t",text:w})),r.length?el("span",{class:"t",text:" "+r.join(" ")}):null); };
export const qNode=i=>Wd().q[i].map(x=>x==="A"||x==="B"?termNode(x):x===N?el("span",{class:"not",text:"not"}):x);
// the four statements as formulas, the short form of the row of answers: 1 A ⇒ not B, 2 A ⇒ B, 3 B ⇒ A, 4 not A ⇒ B.
// The arrow is the answer: ⇒ accepted, ⇏ Why?! (the logic notation of Options uses the same two). Letters, no chips: four chips in a row are too busy.
const FORM=[["A",0,"B",1],["A",0,"B",0],["B",0,"A",0],["A",1,"B",0]];
const fSide=(x,n)=>[n?el("span",{class:"not",text:"not"}):null,n?" ":null,el("span",{class:"ab"+(x==="B"?" lb":""),text:x})];
export const formulaNode=(i,arrow)=>{ const [l,nl,r,nr]=FORM[i];
  return el("span",{class:"fx"},fSide(l,nl)," ",el("span",{class:"ar math",text:arrow})," ",fSide(r,nr)); };
// an answer at a glance: Accept is a filled tag, Why? an outlined one followed by the example.
// The tags carry the marks of the short form (✓ and ?!); title and label words (acd, wyd) are the same words without the mark.
// a Why? answer is spelled out as the sentence it asserts, so the example is tied to its cell:
// both: "X is both [A] a … and [B] a …"; A not B: "X is [A] a …, but not [B] a …"; B not A: the reverse; neither: "X is neither [A] a … nor [B] a …"
// The words that name the cell (both … and, but not, neither … nor) are bold, a mark the chips, the italic terms and the red "not" do not use.
function exSentence(i,t){
  if(!state.fullPh) return el("span",{class:"exn",text:t});
  const A=termNode("A"), B=termNode("B"), K=w=>el("b",{class:"conn",text:w});
  const tail={both:[" is ",K("both")," ",A," ",K("and")," ",B], anb:[" is ",A,", ",K("but not")," ",B], bna:[" is ",B,", ",K("but not")," ",A], nei:[" is ",K("neither")," ",A," ",K("nor")," ",B]}[QCELL[i]];
  return el("span",{class:"exs"},t,tail);
}
export function ansNode(a,ms,i){
  const w=Wd(), tm=ms!=null?el("span",{class:"mut",text:(ms/1000).toFixed(1)+" s"}):null;
  if(a.say==="accept") return el("span",{class:"ans-l"},el("span",{class:"pill acc",text:(w.acm||"")+w.acd}),a.timeout?el("span",{class:"mut",text:"time ran out"}):tm);
  if(a.say==="why") return el("span",{class:"ans-l"},el("span",{class:"pill why",text:w.wyd}),a.text?(i!=null?exSentence(i,a.text):el("span",{class:"exn",text:a.text})):el("span",{class:"mut",text:"no example"}),a.timeout?null:tm);
  return el("span",{class:"ans-l"},el("span",{class:"pill why",text:"Time out"}));
}
