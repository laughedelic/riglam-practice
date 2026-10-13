// A new version of the app is installed in the background and takes over the next time the app is opened
// from scratch, never in the middle of a practice session (no skipWaiting, no reload).
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });
