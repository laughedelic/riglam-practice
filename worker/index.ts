// The Worker's entry (wrangler.jsonc, `main`). Only /api/* reaches it (`assets.run_worker_first`); the static site is served by the platform.
import { createApp } from "./app";
import { bundled } from "./bundled";
import { loadKit } from "./kit";

export default { fetch: createApp({ kit: (env) => loadKit(env, bundled) }).fetch };
