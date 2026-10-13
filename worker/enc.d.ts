// The encrypted course files are imported as bytes (wrangler `rules`, type Data).
declare module "*.enc" {
  const bytes: ArrayBuffer;
  export default bytes;
}
