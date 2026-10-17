// The Worker's bindings. Secrets are set with `wrangler secret put` (docs/SERVER.md); variables are in wrangler.jsonc.
export interface Env {
  /** the static site (dist/pwa); only requests that /api/* does not match are served from it, without running the Worker */
  ASSETS: Fetcher;
  /** the budget counters and the accounts; absent until the database exists, and the tutor and the accounts are then off */
  DB?: D1Database;

  // secrets
  ANTHROPIC_API_KEY?: string;
  /** the Magic Key (docs/DATA.md): four lower-case words joined by dashes. It checks the proofs; with it a device may read the definitions */
  RIGLAM_DATA_KEY?: string;

  // variables (all optional: config.ts has a default for each)
  /** where the model API is; unset means Anthropic's. For a local trial against a stand-in, or a gateway in front of the API. */
  ANTHROPIC_BASE_URL?: string;
  TUTOR_MODEL?: string;
  TUTOR_EFFORT?: string;
  TUTOR_MAX_TOKENS?: string;
  /** most model calls (tool rounds) for one question */
  TUTOR_MAX_ROUNDS?: string;
  /** what one device may spend per UTC day, in US dollars */
  DEVICE_DAILY_BUDGET_USD?: string;
  /** what all devices together may spend per UTC day, in US dollars */
  GLOBAL_DAILY_BUDGET_USD?: string;
  /** what a question is assumed to cost until it has finished, in US dollars; held back from the budgets meanwhile */
  RESERVE_USD?: string;
  /** `on` makes the server answer the check lab's model calls (`POST /api/lab`, worker/lab.ts). Set in the `previews` block of wrangler.jsonc only: any other value, or none, leaves the lab off. */
  LAB?: string;
  /** what one device may spend on the lab per UTC day, in US dollars (the lab has counters of its own, apart from the tutor's) */
  LAB_DEVICE_DAILY_BUDGET_USD?: string;
  /** what all devices together may spend on the lab per UTC day, in US dollars */
  LAB_GLOBAL_DAILY_BUDGET_USD?: string;
  /** who may create an account: `open` (default), `group` (only with the study group's proof) or `closed` */
  SIGNUP?: string;
  /** most accounts (default 300) */
  MAX_ACCOUNTS?: string;
  /** most documents one account may hold (default 5000) */
  MAX_DOCS_PER_ACCOUNT?: string;
  /** most document writes one account may make per UTC day (default 3000) */
  DAILY_WRITES_PER_ACCOUNT?: string;
  /** most sign-in, sign-up and add-a-passkey ceremonies that may be started per UTC day, everybody together (default 2000) */
  CEREMONIES_PER_DAY?: string;
}
