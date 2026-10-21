// Entry of the PWA build: the page runs as an installed app. The platform stands in for the artifact frame.
import "./pwa/fonts.css";
import "./pwa/shell.css";
import { mountUpdateToast } from "./pwa/update-toast";
import { pwaPlatform } from "./pwa/platform"; // before the page: it takes a key out of the address first of all
import "./app/app.css";
import { startApp } from "./app/app.js";

startApp(pwaPlatform);
mountUpdateToast(pwaPlatform.updates!);

// A handle for the browser tests (tests/e2e/pwa) and the console: the platform the page was started with.
(window as unknown as { __riglam: unknown }).__riglam = { platform: pwaPlatform };

// Ask the browser to keep this origin's storage when space runs low (best effort, no prompt on most browsers).
navigator.storage?.persist?.().catch(() => {});
