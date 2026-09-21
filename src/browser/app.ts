/**
 * The page: phone-first UI, shared by both ways of shipping it.
 *
 * The transport is injected. An artifact page passes a driver backed by the
 * `sample` capability; a hosted deployment passes one that POSTs to its own
 * API route, where the key lives. Everything else — the inscription, the
 * Hebrew date, the encoding, the filled form — is the same tested library.
 */

import { renderForm } from "./render-browser.js";
import { encodeLine, BOXES_PER_LINE, LINES_PER_FORM, type Box } from "../lib/form-table.js";
import { derive } from "../lib/conversation.js";
import type { Draft, Message, Turn } from "../lib/conversation.js";
import type { Line } from "../lib/inscription.js";

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

/** How this build hands the viewer a file. */
export type Saver = (filename: string, data: Uint8Array) => Promise<void>;

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
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const history: Message[] = [];
let draft: Draft = {};
let lines: Line[] = [];
let blockers: string[] = ["The inscription is not complete yet."];
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

async function send(text: string) {
  if (busy) return;
  bubble("you", `<p>${esc(text)}</p>`);
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

function offerNext() {
  // The family confirms the spelling by ear. That is a decision they make,
  // so it is a button, not something inferred from what they typed.
  if (draft.hebrewGiven && !draft.nameConfirmed && asked.confirm !== draft.hebrewGiven) {
    asked.confirm = draft.hebrewGiven;
    const el = bubble(
      "d",
      `<p>Read that out loud. Is it how the name was said?</p>
       <button class="btn wide" id="nameok" type="button">Yes, that is right</button>
       <button class="btn wide ghost" id="namebad" type="button" style="margin-top:8px">No, it is not</button>`,
    );
    const settle = (text: string) => {
      const box = el.querySelector(".bubble");
      if (box) box.innerHTML = `<p class="hint">${text}</p>`;
    };
    el.querySelector("#nameok")?.addEventListener("click", () => {
      draft = { ...draft, nameConfirmed: true };
      const d = derive(draft);
      lines = d.lines;
      blockers = d.blockers;
      settle("Confirmed.");
      history.push({ role: "user", content: "Yes, that spelling is right." });
      render();
      offerNext();
    });
    el.querySelector("#namebad")?.addEventListener("click", () => {
      draft = { ...draft, nameConfirmed: false };
      const d2 = derive(draft);
      lines = d2.lines;
      blockers = d2.blockers;
      settle("Not confirmed — tell me how it should sound.");
      history.push({ role: "user", content: "No, that spelling is wrong." });
      asked.confirm = "";
      render();
    });
    return;
  }

  // Day or evening decides the Hebrew date, and it is the family's answer to
  // give, not something to be read out of prose. Same reasoning as the name:
  // a correctness-critical fact should not depend on the model recording it.
  if (draft.diedOn && draft.timeOfDeath !== "daytime" && draft.timeOfDeath !== "after-sunset"
      && asked.sunset !== draft.diedOn) {
    asked.sunset = draft.diedOn;
    const el = bubble(
      "d",
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
      const d = derive(draft);
      lines = d.lines;
      blockers = d.blockers;
      settle(said);
      history.push({ role: "user", content: said });
      render();
      if (t === "unknown") asked.sunset = "";
      else offerNext();
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
    `<p><strong>That is everything.</strong> Here is the order form, filled in.</p>
     <button class="btn wide" id="chatdl" type="button">Download the filled form (PDF)</button>
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
    <button class="btn wide" id="dl" ${ready ? "" : "disabled"}>${ready ? "Download the filled form (PDF)" : "Not ready yet"}</button>`;

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

/* ------------------------------------------------------------ download */

async function download(which: "dl" | "chatdl" = "dl") {
  const btn = document.getElementById(which) as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Building the form…";
  try {
    if (!blankSource && askForBlank) {
      btn.textContent = "Choose the order form…";
      blankSource = await askForBlank();
    }
    if (!blankSource) {
      btn.textContent = "Add the blank order form to continue";
      setTimeout(() => render(), 3000);
      return;
    }
    if (!saveFile) throw new Error("saving unavailable");
    const out = await renderForm(blankSource, lines.map((l) => l.boxes), { cleanScan: true });
    await saveFile("monument-order-form.pdf", out.pdf);
    btn.textContent = "Downloaded";
    return;
  } catch (e) {
    btn.textContent = "Could not build the form";
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    if (which === "dl") setTimeout(() => render(), 2500);
    else setTimeout(() => { btn.disabled = false; btn.textContent = "Download the filled form (PDF)"; }, 2500);
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

  render();

  if (opts.unavailable) {
    bubble("d", opts.unavailable);
    setInput(false);
    return;
  }
  bubble(
    "d",
    `<p>I’ll ask a few questions and write the Hebrew for the stone. <strong>You don’t need to read Hebrew</strong> — I’ll show you how every line sounds and what it says.</p>
     <p>Who is the monument for? Tell me their name in English.</p>`,
  );
  history.push({
    role: "assistant",
    content: "Who is the monument for? Tell me their name in English.",
  });
  setInput(true);
}
