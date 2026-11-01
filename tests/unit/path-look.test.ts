// How the Path looks (src/app/path/look.ts): the lab's settings over the defaults, the line pasted from the lab's "Copy settings", the
// colors worked out as the lab works them out, and the switches as classes on the Path's root.
import { expect, test } from "vitest";
import { DEFAULT_LOOK, lookClasses, lookLine, lookOf, palette, pastedLook } from "../../src/app/path/look.ts";

// the line the owner copied from the lab, Version 21 (its picks are the app's defaults)
const OWNER = '{"mode":"light","light":"ivory","dark":"slate","blue":"#3155a4","gold":"#faaf3f","green":"#4c8a63","red":"#b83545","purple":"#6f3f8f","purpleFor":"tutor","grain":"verdict,station","grainLevel":"soft","wait":"dots","font":"newsreader","hand":"kalam","tM":50,"tLw":2,"tSt":28,"tTn":34,"tHand":19,"choice":"margin","figs":"ink","ahead":"dot","next":"edge","edge":"fade","skip":"beside","why":"row","home":"road","sheet":"top","toggle":"both","keys":"sim","phone":"tall","star":"pair","skip2":"slide","terms":"plain","ask":"row","tutorAuto":"off","abPos":"margin","cOn":"on","cSerif":"spectral","cHand":"pangolin","cBo":"notoserifTib","cSa":"notoserifDeva","cZh":"wenkai","words":"underline","starShape":"bookmark"}';

test("the defaults are the owner's picks in the lab, light or dark aside", () => {
  const picks = JSON.parse(OWNER);
  for (const [k, v] of Object.entries(DEFAULT_LOOK)) if (k in picks && k !== "mode") expect(v, k).toBe(picks[k]);
  expect(DEFAULT_LOOK.mode).toBe("system");
  expect(pastedLook(OWNER)).toEqual({});   // nothing to change: the lab's Mode switch is its preview's, and the rest are the defaults
});

test("a pasted line keeps what differs from the defaults, and only settings the app knows", () => {
  expect(pastedLook('{"light":"linen","tM":60,"mode":"dark","phone":"short"}')).toEqual({ light: "linen", tM: 60 });
  expect(pastedLook("not a line")).toBeNull();
  expect(pastedLook("[1,2]")).toBeNull();
  expect(pastedLook('{"phone":"short"}')).toBeNull();   // a line of the lab, but nothing in it for the app
});

test("a value out of range or not allowed keeps the default", () => {
  const look = lookOf({ light: "neon", tM: 999, tLw: "2.5", blue: "blue", grain: "verdict,glitter,top", toggle: "nested", font: 3 });
  expect(look.light).toBe(DEFAULT_LOOK.light);
  expect(look.tM).toBe(72);
  expect(look.tLw).toBe(2.5);
  expect(look.blue).toBe(DEFAULT_LOOK.blue);
  expect(look.grain).toBe("verdict,top");
  expect(look.font).toBe(DEFAULT_LOOK.font);
});

test("the line for the lab names only the settings that differ", () => {
  expect(lookLine(DEFAULT_LOOK)).toBe("{}");
  expect(JSON.parse(lookLine({ ...DEFAULT_LOOK, edge: "run", tTn: 30 }))).toEqual({ edge: "run", tTn: 30 });
});

test("the colors follow the ground: the inks are mixed into it, and lifted toward white on a dark one", () => {
  const light = palette(DEFAULT_LOOK, false), dark = palette(DEFAULT_LOOK, true);
  expect(light["--paper"]).toBe("#fbf9f2");
  expect(dark["--paper"]).toBe("#161a20");
  expect(light["--blue"]).toBe("#3155a4");
  expect(dark["--blue"]).not.toBe("#3155a4");
  // Claude is orange and not settled is purple (the Design Lab, 1 Nov); the words of Claude take the darker shade
  expect(light["--tutor"]).toBe("#dc7842");
  expect(light["--tutor-t"]).toBe("#aa4a39");
  expect(light["--partc"]).toBe(light["--purple"]);
  expect(dark["--partc"]).toBe(dark["--purple"]);
  expect(dark["--tutor"]).not.toBe(dark["--partc"]);
  // teal is the course's words and slate the way back: lifted toward white on a dark ground as the blue is
  expect(light["--teal"]).toBe("#2b7f86");
  expect(light["--slate"]).toBe("#5b6b7e");
  expect(dark["--teal"]).not.toBe(light["--teal"]);
  expect(dark["--slate"]).not.toBe(light["--slate"]);
});

test("the switches are classes with the lab's names", () => {
  const cls = lookClasses(DEFAULT_LOOK, false);
  expect(cls).toEqual(expect.arrayContaining(["ah-dot", "edge-fade", "figs-ink", "words-underline", "ab-margin", "tg-both", "ch-margin", "why-row", "g-verdict", "g-station"]));
  expect(cls).not.toContain("dark");
  expect(lookClasses({ ...DEFAULT_LOOK, grain: "" }, true)).toContain("dark");
  expect(lookClasses({ ...DEFAULT_LOOK, grain: "" }, true).some((c) => c.startsWith("g-"))).toBe(false);
});
