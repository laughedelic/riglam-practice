// The pages under Settings › About that say what the app is and what it does with what you give it: About RIGLAM (what it is, how to reach the author, the source), Licenses
// (the code, the fonts, and what the definitions are) and Privacy (what stays on the device, what the server keeps, what goes to Claude). Plain words for a learner, no
// analysis: the facts the pages state are docs/SERVER.md's ("Privacy") and docs/DATA.md's. A page is a few short paragraphs under small headings (path/lines.tsx) and the
// lines that open an address outside the app.
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { Group, Intro, Line } from "./lines.tsx";

/** The source code, and where it is read. */
export const REPO_URL = "https://github.com/laughedelic/riglam-practice";
/** The place to write to the author, for someone with a GitHub account. */
export const ISSUES_URL = REPO_URL + "/issues";
export const LICENSE_URL = REPO_URL + "/blob/main/LICENSE";
export const FONTS_URL = REPO_URL + "/blob/main/public/licenses/fonts-OFL.txt";

const P = ({ children }: { children?: ComponentChildren }) => <p class="sprose">{children}</p>;

/** About RIGLAM: what it is and is not, how to say what is wrong, and the source. */
export function AboutPage() {
  return <>
    <Intro>RIGLAM is a personal project: a small app for practicing Buddhist logic and debate a few minutes at a time. It does not replace practicing together or with a teacher. It is not affiliated with the course and not endorsed by its organizers, and its mistakes are the author’s.</Intro>
    <Group name="Feedback">
      <P>What is confusing, what is wrong, what you would like to practice next: all of it helps. Tell whoever shared the app with you, or write on GitHub, which needs an account there. For a wrong answer from Claude, use the flag beside it.</P>
      <Line title="Write on GitHub" sub="github.com/laughedelic/riglam-practice/issues" href={ISSUES_URL} />
    </Group>
    <Group name="Source code">
      <P>The code is open: you can read it, run your own copy and change it.</P>
      <Line title="Source code" sub="github.com/laughedelic/riglam-practice" href={REPO_URL} />
    </Group>
  </>;
}

/** Licenses: the code, the fonts, and what the terms and definitions are. */
export function LicensesPage() {
  return <>
    <Intro>What the app is made of, and the terms it is shared under.</Intro>
    <Group name="The code">
      <P>RIGLAM’s code is free software under the GNU Affero General Public License, version 3. It uses Preact, under the MIT license.</P>
      <Line title="Source code" sub="github.com/laughedelic/riglam-practice" href={REPO_URL} />
      <Line title="License text" sub="GNU AGPL 3, on GitHub" href={LICENSE_URL} />
    </Group>
    <Group name="Fonts">
      <P>The typefaces are open fonts, each under the SIL Open Font License 1.1, served from the app itself. Their names, copyright notices and the license are in one file.</P>
      <Line title="Font licenses" sub="SIL Open Font License 1.1, on GitHub" href={FONTS_URL} />
    </Group>
    <Group name="Terms and definitions">
      <P>The list of terms, how they relate and the practice items are in the source code’s repository.</P>
      <P>The definitions and notes are not. They are kept on the app’s server and shown only on a device with the Magic Key, and the code’s license does not cover them. They draw on the course booklet and on published translations and commentaries, and the rights to those stay with their authors and publishers. Please do not copy or pass them on.</P>
    </Group>
  </>;
}

/** Privacy: what stays on the device, what the server keeps, and what goes to Claude. What does not apply to this server or device is left out. */
export function PrivacyPage() {
  const acct = !!(state.account && state.db && state.account.view().available), ask = canAsk(), shares = ask && !!state.learns;
  return <>
    <Intro>What the app keeps, where, and who can read it. The app has no ads and no analytics.</Intro>
    <Group name="On this device">
      <P>Your answers, progress, favorites and settings stay in this browser, on this device. Your data, in Settings, saves them to a file.</P>
    </Group>
    {acct ? <Group name="Account">
      <P>An account is optional. It uses a passkey: no email, no password. It keeps a copy of your practice (answers, debates, favorites and the like) on the app’s server, so that you have the same progress on two devices, along with the name you chose. Delete the account in Settings and the copy goes with it.</P>
    </Group> : null}
    {ask ? <Group name="Claude">
      <P>When you ask Claude to explain or check something, your question, your answer and the terms they name are sent through the app’s server to Anthropic, the company that makes Claude. The server keeps a count for each device, under a random id, of when it asked and what it cost, never the words{shares ? ", apart from the examples you agree to share" : ""}. The server runs on Cloudflare.</P>
    </Group> : null}
    {shares ? <Group name="Examples you share">
      <P>The first time Claude checks an example you wrote, the app asks whether its words may be kept for other learners. If you say Ok, only the words are kept, not who wrote them, and the person who runs the app can read them. You can change this in Settings.</P>
    </Group> : null}
    {ask ? <Group name="Flags">
      <P>A flag you send goes to the person who runs the app, after a first reading by Claude. It holds the flag, Claude’s answer, the app version and your device’s random id, and your account’s if you are signed in. No name, no email.</P>
    </Group> : null}
  </>;
}
