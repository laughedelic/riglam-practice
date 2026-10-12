// Entry of the artifact build (scripts/build-artifact.mjs): the page runs inside the Claude artifact frame.
import "./app/app.css";
import { startApp } from "./app/app.js";
import { artifactPlatform } from "./artifact/platform";

startApp(artifactPlatform);
