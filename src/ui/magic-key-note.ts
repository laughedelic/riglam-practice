// What the Magic Key is, said where it is asked for: the key prompt (src/pwa/unlock.ts) and the Magic Key page of Settings on the Path. The second is the hint under it.
export const MAGIC_KEY_ABOUT = [
  "The Magic Key is four words that come with the course. Entered once, it unlocks the course’s definitions and notes on this device, so terms show what they mean, and Claude’s explanations, which use them.",
  "Without it you can still practice. Ask your teacher or whoever shared the app with you.",
] as const;

// The note behind the dotted "Magic Key" in the key prompt (src/pwa/unlock.ts) and in the Magic Key row of Options: why the key has
// this name. One paragraph per entry.
export const MAGIC_KEY_NOTE = [
  "Purbuchok’s classic textbook of reasoning, which the course follows, is called The Magic Key to the Path of Reasoning (rigs lam ’phrul gyi lde mig).",
  "This key plays on that name: it opens the way into the definitions and explanations.",
] as const;
