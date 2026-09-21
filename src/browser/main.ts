/**
 * The artifact page.
 *
 * Phone-first. The dialogue is driven by the real model through the artifact
 * `sample` capability; the inscription, the Hebrew date, the encoding and the
 * filled form all come from the same tested library the server uses. Nothing
 * here reimplements any of it.
 */

import { BrowserConversation } from "./ask-claude.js";
import { renderForm } from "./render-browser.js";
import { encodeLine, BOXES_PER_LINE, LINES_PER_FORM, type Box } from "../lib/form-table.js";
import type { Draft, Message, Turn } from "../lib/conversation.js";
import type { Line } from "../lib/inscription.js";

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
    DIGNITY_BLANK?: string;
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const history: Message[] = [];
let draft: Draft = {};
let lines: Line[] = [];
let blockers: string[] = ["The inscription is not complete yet."];
let convo: BrowserConversation | null = null;
let busy = false;

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
  for (const r of turn.rejected) {
    html += `<p class="err">I could not use “${esc(r.hebrew)}” — ${esc(r.reason)}.</p>`;
  }
  bubble("d", html);
  render();
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
    <button class="btn wide" id="dl" ${ready ? "" : "disabled"}>${ready ? "Download the filled form" : "Not ready yet"}</button>`;

  const dl = document.getElementById("dl");
  if (dl && ready) dl.addEventListener("click", download);

  $("ck-blockers").textContent = ready ? "Ready" : `${blockers.length} to resolve`;
  $("ck-blockers").className = "ck " + (ready ? "done" : lines.length ? "open" : "");
  $("pill").textContent = ready ? "Ready" : "Draft";
}

function boxesOf(s: string): Box[] {
  const r = encodeLine(s);
  return r.ok ? r.boxes : [];
}

/* ------------------------------------------------------------ download */

async function download() {
  const btn = document.getElementById("dl") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Building the form…";
  try {
    const blank = window.DIGNITY_BLANK;
    if (!blank) throw new Error("no blank form bundled");
    const out = await renderForm(blank, lines.map((l) => l.boxes), { cleanScan: true });
    const downloads = (await window.claude?.use("downloads")) as
      | { save(o: { filename: string; data: Uint8Array }): Promise<unknown> }
      | null;
    if (!downloads) throw new Error("downloads unavailable");
    await downloads.save({ filename: "monument-order-form.pdf", data: out.pdf });
    btn.textContent = "Downloaded";
  } catch (e) {
    btn.textContent = "Could not build the form";
    // eslint-disable-next-line no-console
    console.error(e);
  } finally {
    setTimeout(() => render(), 2500);
  }
}

/* ---------------------------------------------------------------- boot */

async function boot() {
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

  const sample = (await window.claude?.use("sample")) as
    | { json<T>(i: unknown, o?: Record<string, unknown>): Promise<T> }
    | null
    | undefined;

  if (!sample) {
    bubble(
      "d",
      `<p>This page needs Claude to run the conversation, and it is not available here.</p>
       <p class="hint">Open it from your Claude account — the link works there.</p>`,
    );
    setInput(false);
    return;
  }
  convo = new BrowserConversation(sample);
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

void boot();
