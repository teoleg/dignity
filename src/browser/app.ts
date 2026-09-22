/**
 * The page: phone-first UI, shared by both ways of shipping it.
 *
 * The transport is injected. An artifact page passes a driver backed by the
 * `sample` capability; a hosted deployment passes one that POSTs to its own
 * API route, where the key lives. Everything else — the inscription, the
 * Hebrew date, the encoding, the filled form — is the same tested library.
 */

import { renderImage } from "./render-browser.js";
import { encodeLine, BOXES_PER_LINE, LINES_PER_FORM, type Box } from "../lib/form-table.js";
import { candidateDates, confirmName, confirmedKey, derive } from "../lib/conversation.js";
import type { Draft, Message, Turn } from "../lib/conversation.js";
import type { Line } from "../lib/inscription.js";

declare const __BUILD__: string;

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
    DIGNITY_BLANK?: string;
  }
}

/** How this build reaches the model. */
export interface Driver {
  advance(history: readonly Message[], draft: Draft): Promise<Turn>;
}

/**
 * How this build hands the viewer the finished form.
 *
 * The filled form is a picture, so that a phone can keep it in its photo
 * library, print it from there, and show every version that was saved.
 * `mime` is passed rather than guessed from the name: a wrong type on a
 * phone is the difference between "Save Image" and a file nobody can find.
 */
export type Saver = (filename: string, data: Uint8Array, mime: string) => Promise<void>;

export interface StartOptions {
  driver: Driver;
  save: Saver;
  /** Data URI or URL of the vendor blank; "" when none is available yet. */
  blank: string;
  /**
   * Asked for the blank when the viewer wants the form and none is present.
   * Resolves to a data URI, or "" if they changed their mind. Lets a
   * deployment that shipped without the vendor's artwork acquire it from
   * whoever has it, on a phone, without a rebuild.
   */
  onNeedBlank?: () => Promise<string>;
  /** Shown when the driver cannot be created at all. */
  unavailable?: string;
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// Stamp the build as soon as the bundle runs — before the passcode gate, so
// "is my change live?" can be answered by looking at the screen.
{
  const el = document.getElementById("build");
  if (el) el.textContent = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
}
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const history: Message[] = [];
let draft: Draft = {};
let lines: Line[] = [];
let blockers: string[] = derive({}).blockers;
let convo: Driver | null = null;
let busy = false;
let saveFile: Saver | null = null;
let blankSource = "";
let askForBlank: (() => Promise<string>) | null = null;
/** What Hebrew the conversation has already shown, so a card appears once. */
const shown = { given: "", father: "", extra: "" };

/* ---------------------------------------------------------------- chat */

function bubble(who: "you" | "d", html: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `msg${who === "you" ? " you" : ""}`;
  el.innerHTML = `<div class="bubble">${html}</div>`;
  $("log").append(el);
  $("log").scrollTop = $("log").scrollHeight;
  return el;
}

async function send(text: string, showBubble = true) {
  if (busy) return;
  if (showBubble) bubble("you", `<p>${esc(text)}</p>`);
  history.push({ role: "user", content: text });
  busy = true;
  setInput(false);
  const thinking = bubble("d", `<p class="hint">Thinking…</p>`);

  try {
    if (!convo) throw new Error("no-sample");
    const turn: Turn = await convo.advance(history, draft);
    thinking.remove();
    apply(turn);
  } catch (e) {
    thinking.remove();
    const code = (e as { code?: string }).code ?? "";
    bubble("d", `<p class="err">${esc(copyFor(code))}</p>`);
  } finally {
    busy = false;
    setInput(true);
    $("entry").focus();
  }
}

function copyFor(code: string): string {
  switch (code) {
    case "not_granted":
    case "sampling_disabled":
      return "This page needs permission to use Claude, and it was not given. Reload and allow it to continue.";
    case "rate_limited":
      return "Claude is busy on your account right now. Wait a moment and try again.";
    case "session_expired":
      return "Your Claude session expired — sign in again, then reload.";
    case "invalid_json":
    case "empty_completion":
      return "That reply came back garbled. Try saying it a different way.";
    default:
      return "Something went wrong reaching Claude. Try again in a moment.";
  }
}

function apply(turn: Turn) {
  draft = turn.draft;
  lines = turn.lines;
  blockers = turn.blockers;
  history.push({ role: "assistant", content: turn.reply });

  let html = `<p>${esc(turn.reply).replace(/\n/g, "</p><p>")}</p>`;

  // Show the Hebrew where it is being discussed. The model is told to keep
  // Hebrew out of its prose (it cannot be trusted to get a date right in
  // letters), so without this the conversation talks about a spelling the
  // reader never sees — and the stone above is far too small to read.
  if (draft.hebrewGiven && draft.hebrewGiven !== shown.given) {
    shown.given = draft.hebrewGiven;
    const full = draft.hebrewFather
      ? `${draft.hebrewGiven} ${draft.gender === "female" ? "בת" : "בן"} ${draft.hebrewFather}`
      : draft.hebrewGiven;
    const said = [draft.hebrewGivenSaid, draft.hebrewFather ? (draft.gender === "female" ? "bat" : "ben") : "", draft.hebrewFatherSaid]
      .filter(Boolean).join(" ");
    html += card(full, said);
    shown.father = draft.hebrewFather ?? "";
  } else if (draft.hebrewFather && draft.hebrewFather !== shown.father) {
    shown.father = draft.hebrewFather;
    html += card(draft.hebrewFather, draft.hebrewFatherSaid ?? "");
  }
  if (draft.extra && draft.extra.hebrew !== shown.extra) {
    shown.extra = draft.extra.hebrew;
    html += card(draft.extra.hebrew, draft.extra.pronunciation, draft.extra.english);
  }

  for (const r of turn.rejected) {
    html += `<p class="err">I could not use “${esc(r.hebrew)}” — ${esc(r.reason)}.</p>`;
  }
  bubble("d", html);
  render();
  offerNext();
}

/**
 * Move the conversation forward on whatever is standing in the way.
 *
 * Two things used to go wrong here. The form lived only at the bottom of the
 * "Check lines" sheet, so people finished and never found it. And confirming
 * the name depended on the model choosing to record it — if it did not, the
 * order stayed blocked forever with nothing on screen saying why. Both are
 * decided here now, from state the page can see.
 */
let asked = { confirm: "", sunset: "", offered: false };

/**
 * The question bubble waiting for an answer, if any.
 *
 * Pressing "Make the form" can put a question back, and two live copies of
 * the same buttons is a page where the family answers the wrong one.
 */
let askEl: HTMLElement | null = null;
function ask(html: string): HTMLElement {
  // Only a question still waiting is replaced. One that was answered stays:
  // it is the record of what the family said.
  if (askEl?.isConnected && askEl.querySelector("button")) askEl.remove();
  askEl = bubble("d", html);
  return askEl;
}

/** Re-derive the inscription after the page itself changes the draft. */
function recompute() {
  const d = derive(draft);
  lines = d.lines;
  blockers = d.blockers;
}

/**
 * What happens when nobody knows the hour.
 *
 * The date given is used as it stands, with no sunset adjustment, and the
 * order carries on (ADR 0008). It is not silent: the family is told which
 * date is being engraved, what the other one would be, and can swap to it
 * with one press. The inscription's own gloss says the hour was unknown, so
 * this can never be mistaken later for a date somebody knew.
 */
function noteTheDateUsed() {
  const both = candidateDates(draft);
  if (!both) return;
  const usingEvening = draft.dateWhenUnknown === "after-sunset";
  const using = usingEvening ? both.afterSunset : both.daytime;
  const other = usingEvening ? both.daytime : both.afterSunset;
  const el = ask(
    `<p>Nobody knows the hour, so I am using the date as you gave it:
       <strong>${esc(using)}</strong>.</p>
     <p class="hint">The Jewish day begins at sunset. Had it been after sunset the
       date would be ${esc(other)} — that is the date kept every year, so if anyone
       does remember, change it here. The order form says the hour was unknown
       either way.</p>
     <button class="btn wide ghost" id="dswap" type="button">Use ${esc(other)} instead</button>`,
  );
  el.querySelector("#dswap")?.addEventListener("click", () => {
    const which = usingEvening ? "daytime" : "after-sunset";
    draft = { ...draft, dateWhenUnknown: which };
    recompute();
    const box = el.querySelector(".bubble");
    if (box) box.innerHTML = `<p class="hint">Using ${esc(other)}.</p>`;
    render();
    void send(`Use ${other} — the date if it was after sunset.`, false);
    offerNext();
  });
}

function offerNext() {
  // The family confirms the spelling by ear. That is a decision they make,
  // so it is a button, not something inferred from what they typed.
  if (draft.hebrewGiven && !draft.nameConfirmed && asked.confirm !== confirmedKey(draft)) {
    asked.confirm = confirmedKey(draft);
    const el = ask(
      `<p>Read that out loud. Is it how the name was said?</p>
       <button class="btn wide" id="nameok" type="button">Yes, that is right</button>
       <button class="btn wide ghost" id="namebad" type="button" style="margin-top:8px">No, it is not</button>`,
    );
    const settle = (text: string) => {
      const box = el.querySelector(".bubble");
      if (box) box.innerHTML = `<p class="hint">${text}</p>`;
    };
    el.querySelector("#nameok")?.addEventListener("click", () => {
      // confirmName stamps *which* spelling was confirmed, so the answer
      // survives the model re-stating the same name later.
      draft = confirmName(draft);
      recompute();
      settle("Confirmed.");
      render();
      // Tell the model too, or the conversation stops here and the family has
      // to prod it to get the next question.
      void send("Yes, that spelling is right.", false);
    });
    el.querySelector("#namebad")?.addEventListener("click", () => {
      draft = { ...draft, nameConfirmed: false };
      delete draft.nameConfirmedFor;
      recompute();
      settle("Not right — I will ask again.");
      asked.confirm = "";
      render();
      void send("No, that spelling is not how the name was said.", false);
    });
    return;
  }

  // Day or evening decides the Hebrew date, and it is the family's answer to
  // give, not something to be read out of prose. Same reasoning as the name:
  // a correctness-critical fact should not depend on the model recording it.
  if (draft.diedOn && draft.timeOfDeath !== "daytime" && draft.timeOfDeath !== "after-sunset"
      && asked.sunset !== draft.diedOn) {
    asked.sunset = draft.diedOn;
    const el = ask(
      `<p>Was it during the day, or in the evening?</p>
       <p class="hint">The Jewish day starts at sunset, so an evening death is recorded on the next day. It sets the date remembered every year.</p>
       <button class="btn wide" id="tday" type="button">During the day</button>
       <button class="btn wide ghost" id="teve" type="button" style="margin-top:8px">In the evening</button>
       <button class="btn wide ghost" id="tidk" type="button" style="margin-top:8px">Nobody knows</button>`,
    );
    const settle = (text: string) => {
      const box = el.querySelector(".bubble");
      if (box) box.innerHTML = `<p class="hint">${text}</p>`;
    };
    const pick = (t: "daytime" | "after-sunset" | "unknown", said: string) => {
      draft = { ...draft, timeOfDeath: t };
      recompute();
      if (t === "unknown") {
        settle("Nobody knows what hour it was.");
        noteTheDateUsed();
      } else {
        settle(said);
      }
      render();
      void send(said, false);
    };
    el.querySelector("#tday")?.addEventListener("click", () => pick("daytime", "During the day."));
    el.querySelector("#teve")?.addEventListener("click", () => pick("after-sunset", "In the evening."));
    el.querySelector("#tidk")?.addEventListener("click", () =>
      pick("unknown", "Nobody knows — the date stays unconfirmed."));
    return;
  }

  if (blockers.length > 0) {
    asked.offered = false;
    return;
  }
  if (asked.offered) return;
  asked.offered = true;
  const el = bubble(
    "d",
    `<p><strong>That is everything.</strong> I can fill in the order form now.</p>
     <button class="btn wide" id="chatdl" type="button">Make the filled form</button>
     <button class="btn wide ghost" id="chatcheck" type="button" style="margin-top:8px">Check every line first</button>`,
  );
  el.querySelector("#chatdl")?.addEventListener("click", () => void download("chatdl"));
  el.querySelector("#chatcheck")?.addEventListener("click", () => {
    $("sheet-checks").hidden = false;
  });
}

/** The Hebrew, how it sounds, and what it means — the three-part check. */
function card(hebrew: string, said: string, means?: string): string {
  const boxes = boxesOf(hebrew).length;
  return `<div class="prop">
    <span class="heb">${esc(hebrew)}</span>
    ${said ? `<div class="say">Sounds like: <strong>${esc(said)}</strong></div>` : ""}
    ${means ? `<div class="means">Means: ${esc(means)}</div>` : ""}
    <div class="propcount">${boxes} of ${BOXES_PER_LINE} boxes</div>
  </div>`;
}

const setInput = (on: boolean) => {
  ($("entry") as HTMLInputElement).disabled = !on;
  ($("sendbtn") as HTMLButtonElement).disabled = !on;
};

/* -------------------------------------------------------------- render */

function render() {
  const stone = lines.length
    ? lines
        .map((l) => `<div${l.blocked ? ' class="flag"' : ""}>${esc(l.hebrew)}</div>`)
        .join("")
    : `<div class="none">appears as you answer</div>`;
  $("peek-lines").innerHTML = stone;
  $("big-lines").innerHTML = stone;

  const full = [draft.englishGiven, draft.englishSurname].filter(Boolean).join(" ");
  $("big-fam").textContent = (draft.englishSurname ?? "").toUpperCase();
  $("big-given").textContent = full.toUpperCase();
  $("big-yrs").textContent = draft.diedOn
    ? new Date(draft.diedOn + "T12:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      }).toUpperCase()
    : "";
  $("peek-title").textContent = full || "The stone";
  $("peek-sub").textContent = lines.length
    ? `${lines.length} of ${LINES_PER_FORM} lines`
    : "It appears here as you answer.";

  const items = lines
    .map((l) => {
      const n = boxesOf(l.hebrew).length;
      return `<div class="lineitem">
        <span class="heb">${esc(l.hebrew)}</span>
        <span class="en">${esc(l.english)}</span>
        ${l.pronunciation ? `<div class="say">Sounds like: <strong>${esc(l.pronunciation)}</strong></div>` : ""}
        ${l.blocked ? `<div class="blockline">${esc(l.blocked)}</div>` : ""}
        <div class="meta">
          <span class="tag ${l.source === "family" ? "fam" : "gen"}">${l.source === "family" ? "Your words" : "Standard"}</span>
          <span class="count">${n} / ${BOXES_PER_LINE} boxes</span>
        </div></div>`;
    })
    .join("") || `<p class="cap">Nothing yet — answer the questions first.</p>`;

  const used = lines.length;
  const free = Math.max(0, LINES_PER_FORM - used);
  const cap = lines.length
    ? `<p class="cap"><strong>${used} of ${LINES_PER_FORM} lines used.</strong> ${
        free ? `${free} line${free > 1 ? "s" : ""} free — ${BOXES_PER_LINE} characters each.` : "The form is full."
      }</p>`
    : "";

  const labels = ["Inscription", "First Line", "Second Line", "Third Line", "Fourth Line"];
  const sheet = labels
    .map((lab, i) => {
      const l = lines[i];
      const codes: Box[] = l ? l.boxes : [];
      let cells = "";
      for (let b = 0; b < BOXES_PER_LINE; b++) {
        const idx = BOXES_PER_LINE - 1 - b;
        const v = idx < codes.length ? codes[idx] : undefined;
        const s = v === null || v === undefined ? "" : String(v);
        cells += `<div class="bx${s ? " set" : ""}">${s}</div>`;
      }
      return `<div class="rowlab">${lab}</div><div class="boxes">${cells}</div>`;
    })
    .join("");

  const ready = blockers.length === 0;
  const why = ready ? "" : `<ul class="blocklist">${blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;

  $("checkbody").innerHTML = `${cap}${items}
    ${why}
    <h3 class="sub">The order form that gets sent</h3>
    <div class="formscroll"><div class="formwide">${sheet}</div></div>
    <p class="swipe">Swipe sideways to see all ${BOXES_PER_LINE} boxes. We fill them right to left — you never type a number.</p>
    <button class="btn wide" id="dl" ${ready ? "" : "disabled"}>${ready ? "Make the filled form" : "Not ready yet"}</button>`;

  const dl = document.getElementById("dl");
  if (dl && ready) dl.addEventListener("click", () => void download("dl"));

  $("ck-blockers").textContent = ready
    ? "Ready — form available"
    : blockers[0] ?? "Not started";
  $("ck-blockers").className = "ck " + (ready ? "done" : lines.length ? "open" : "");
  $("pill").textContent = ready ? "Ready" : "Draft";
}

function boxesOf(s: string): Box[] {
  const r = encodeLine(s);
  return r.ok ? r.boxes : [];
}

/* ---------------------------------------------------------- the form */

/** The last picture built, so tapping again does not rebuild or re-ask. */
let builtFor = "";
let builtPng: Uint8Array | null = null;

/** Which inscription the picture on screen is of, so it is shown once. */
let shownKey = "";
let shownEl: HTMLElement | null = null;

/** Show the filled form in the conversation, where a phone can act on it. */
function showForm(png: Uint8Array): HTMLElement {
  const bytes = new Uint8Array(png.byteLength);
  bytes.set(png);
  const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "image/png" }));
  const el = bubble(
    "d",
    `<p>Here is the order form with the numbers filled in.</p>
     <a class="formshot" href="${url}" target="_blank" rel="noopener">
       <img src="${url}" alt="The order form, filled in">
     </a>
     <button class="btn wide" id="savepic" type="button">Save it to your photos</button>
     <p class="hint">Or press and hold the picture and choose <strong>Add to Photos</strong>.
     Print it from there. Saving again after a change keeps both versions.</p>`,
  );
  const btn = el.querySelector("#savepic") as HTMLButtonElement | null;
  btn?.addEventListener("click", () => {
    if (!saveFile) return;
    btn.disabled = true;
    const was = btn.textContent;
    void saveFile("monument-order-form.png", bytes, "image/png")
      .then(() => {
        btn.textContent = "Saved";
      })
      .catch(() => {
        btn.textContent = "Could not save — press and hold the picture instead";
      })
      .finally(() => {
        btn.disabled = false;
        setTimeout(() => {
          if (btn.textContent === "Saved") btn.textContent = was ?? "Save it to your photos";
        }, 4000);
      });
  });
  return el;
}

/**
 * What is standing in the way, said plainly, with a way to act on it.
 *
 * Families do not all answer one question at a time — some write everything
 * in one message — and a model that believes it is finished stops asking. So
 * the form button is always live, and pressing it early is what restarts the
 * conversation: it names every blocker, puts back whichever of the page's own
 * two questions is unanswered, and asks the model for what it still needs.
 */
function explainMissing() {
  bubble(
    "d",
    `<p><strong>Not yet — here is what is still missing.</strong></p>
     <ul class="blocklist">${blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`,
  );
  // Put back a confirmation the family has not given. These are the page's to
  // ask, and it must not matter whether the model thought to raise them.
  if (draft.hebrewGiven && !draft.nameConfirmed) asked.confirm = "";
  if (draft.diedOn && draft.timeOfDeath !== "daytime" && draft.timeOfDeath !== "after-sunset") {
    asked.sunset = "";
  }
  offerNext();
  // Anything else is a fact only the family can give, so ask for it there.
  if (blockers.some((b) => b.startsWith("Still needed"))) {
    void send("I would like the order form now. What do you still need from me?", false);
  }
}

async function download(which: "dl" | "chatdl" | "makeform" = "dl") {
  const btn = document.getElementById(which) as HTMLButtonElement | null;
  if (!btn) return;
  // Asking for the form before it is ready is a fair thing to do, and the
  // answer is what is still missing — never a dead button.
  if (blockers.length > 0) {
    explainMissing();
    return;
  }
  // The header button keeps its short label; the ones in the conversation
  // report what happened where the family is reading.
  const header = which === "makeform";
  const label = header ? "Make the form" : btn.textContent ?? "Make the filled form";
  /** Whatever happens, the viewer must be left able to try again. */
  const restore = (text?: string) => {
    btn.disabled = false;
    btn.classList.remove("working");
    btn.textContent = header ? label : text ?? label;
    if (!header && text) btn.textContent = text;
  };
  btn.disabled = true;
  btn.classList.add("working");
  btn.textContent = header ? "Filling…" : "Filling the form…";
  try {
    if (!blankSource && askForBlank) {
      btn.textContent = "Waiting for the blank form…";
      blankSource = await askForBlank();
    }
    if (!blankSource) {
      // Cancelled the picker. Do not strand the button.
      restore("I need the blank order sheet first — tap to choose it");
      setTimeout(() => restore(), 4000);
      return;
    }
    // Rebuild only when the inscription itself changed.
    const key = lines.map((l) => l.hebrew).join("|");
    if (builtFor !== key || !builtPng) {
      const out = await renderImage(blankSource, lines.map((l) => l.boxes), { cleanScan: true });
      builtPng = out.png;
      builtFor = key;
    }
    $("sheet-checks").hidden = true;
    // Same inscription, same picture: scroll back to it rather than posting a
    // second copy. A changed inscription gets its own, so the conversation
    // keeps every version that was made.
    if (shownKey === key && shownEl?.isConnected) {
      shownEl.scrollIntoView({ block: "center" });
    } else {
      shownEl = showForm(builtPng);
      shownKey = key;
    }
    restore("Show the form again");
  } catch (e) {
    restore("Could not fill the form — tap to retry");
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

/* ---------------------------------------------------------------- boot */

export async function start(opts: StartOptions): Promise<void> {
  convo = opts.driver;
  saveFile = opts.save;
  blankSource = opts.blank;
  askForBlank = opts.onNeedBlank ?? null;
  $("peek").addEventListener("click", () => ($("sheet-stone").hidden = false));
  $("openchecks").addEventListener("click", () => ($("sheet-checks").hidden = false));
  document.addEventListener("click", (e) => {
    const c = (e.target as HTMLElement).closest("[data-close]");
    if (c) $((c as HTMLElement).dataset.close!).hidden = true;
  });
  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const el = $("entry") as HTMLInputElement;
    const v = el.value.trim();
    if (!v) return;
    el.value = "";
    void send(v);
  });
  $("restart").addEventListener("click", () => location.reload());
  $("makeform").addEventListener("click", () => void download("makeform"));

  render();

  if (opts.unavailable) {
    bubble("d", opts.unavailable);
    setInput(false);
    return;
  }
  // The opening is the page's own, not the model's: the first thing a family
  // sees should not depend on a network call. It says what language to use
  // because families here do not all think in English — and because a name
  // written the way the family says it is better input for the Hebrew than
  // one they have translated for us first.
  const OPENING =
    "Who is the monument for? Tell me their name. Write in whatever language " +
    "you are comfortable with — English, Russian, Hebrew, Yiddish, Spanish — " +
    "and I will answer in the same one.";
  bubble(
    "d",
    `<p>I’ll ask a few questions and write the Hebrew for the stone. <strong>You don’t need to read Hebrew</strong> — I’ll show you how every line sounds and what it says.</p>
     <p>${esc(OPENING)}</p>`,
  );
  history.push({ role: "assistant", content: OPENING });
  setInput(true);
}
