import { state } from "../state.js";
// Whether the tutor can be asked at all: through the host's own model call (the Claude artifact) or the app's server (the installed app).
// The check lab picks the models itself and has its own capability (`labSample`), so it does not use this.
// The errors that mean the place does not allow the tutor (or the lab) at all: the page stops asking for the rest of this load.
export const ERR_OFF=["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"];
export const canAsk=()=>!!(state.sample||state.tutor);
