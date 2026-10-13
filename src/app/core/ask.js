import { state } from "../state.js";
// Whether the tutor can be asked at all: through the host's own model call (the Claude artifact) or the app's server (the installed app).
// The check lab needs `sample` itself (it picks the models), so it does not use this.
export const canAsk=()=>!!(state.sample||state.tutor);
