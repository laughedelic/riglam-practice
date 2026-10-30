// The fixed train / test split of the cases: a hash of the case id, so a case keeps its half when cases are added. About one in three is test.
export function splitOf(id: string): "train" | "test" {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % 3 === 0 ? "test" : "train";
}
