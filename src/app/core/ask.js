import { state } from "../state.js";
// The errors that mean the place does not allow the tutor at all: the page stops asking for the rest of this load.
export const ERR_OFF=["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"];
// Whether the tutor can be asked at all: through the host's own model call (the Claude artifact) or the app's server (the installed app).
export const canAsk=()=>!!(state.sample||state.tutor);
