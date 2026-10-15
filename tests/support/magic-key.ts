// A random Magic Key for tests: four lower-case words joined by dashes, different each time.
export const testMagicKey = (): string => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const word = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => letters[b % 26]).join("");
  return [word(), word(), word(), word()].join("-");
};
