/**
 * Entry for the hosted build.
 *
 * The model is reached through this deployment's own `/api/chat`, where the
 * API key lives — it never reaches the browser. Viewers need no account of
 * any kind; a shared passcode keeps a stray link from spending credit.
 */
import { start } from "./app.js";
import type { Draft, Message, Turn } from "../lib/conversation.js";

const PASS_KEY = "dignity.pass";
const BLANK_KEY = "dignity.blank";

function readPass(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? "";
  } catch {
    return "";
  }
}
function storePass(v: string) {
  try {
    localStorage.setItem(PASS_KEY, v);
  } catch {
    /* private mode: the passcode simply asks again next load */
  }
}

class WebDriver {
  async advance(history: readonly Message[], draft: Draft): Promise<Turn> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dignity-pass": readPass() },
      body: JSON.stringify({ history, draft }),
    });
    if (res.status === 401) {
      try {
        localStorage.removeItem(PASS_KEY);
      } catch { /* ignore */ }
      throw { code: "not_granted", message: "wrong passcode" };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      throw { code: body.code ?? "upstream_error", message: body.message ?? res.statusText };
    }
    return (await res.json()) as Turn;
  }
}

/** A plain file download. */
const save = async (filename: string, data: Uint8Array) => {
  // Copy into a plain ArrayBuffer: a Uint8Array over SharedArrayBuffer is
  // not a valid BlobPart.
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

function askForPass(): Promise<void> {
  return new Promise((resolve) => {
    const gate = document.getElementById("gate");
    const form = document.getElementById("gateform") as HTMLFormElement | null;
    const input = document.getElementById("gatepass") as HTMLInputElement | null;
    if (!gate || !form || !input) return resolve();
    gate.hidden = false;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      storePass(v);
      gate.hidden = true;
      resolve();
    });
  });
}

/**
 * Where the vendor blank comes from.
 *
 * A deployment made from the repository has none — it is the vendor's
 * artwork and is deliberately not committed. So: use the one the deployment
 * shipped if it has it, else one a viewer added before, else ask.
 */
async function findBlank(): Promise<string> {
  try {
    const res = await fetch("/blank-form.jpg", { method: "HEAD" });
    if (res.ok) return "/blank-form.jpg";
  } catch {
    /* not deployed with one */
  }
  if (blankInMemory) return blankInMemory;
  try {
    blankInMemory = localStorage.getItem(BLANK_KEY) ?? "";
    return blankInMemory;
  } catch {
    return "";
  }
}

/**
 * Shrink a picked image before it is used or stored.
 *
 * A photo straight from a phone camera is several megabytes. Stored as a
 * data URI that overflows the browser's quota, so the save fails silently and
 * the viewer is asked for the form again every single time — and the same
 * bytes get embedded in every PDF. The form is a line drawing: 1600px across
 * is more than the grid detector needs.
 */
async function shrink(file: File, maxWidth = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Held for the session even when storage refuses it, so we ask at most once. */
let blankInMemory = "";

function pickBlank(): Promise<string> {
  if (blankInMemory) return Promise.resolve(blankInMemory);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve("");
      void shrink(file)
        .then((uri) => {
          blankInMemory = uri;
          try {
            localStorage.setItem(BLANK_KEY, uri);
          } catch {
            /* over quota: the session copy still serves */
          }
          resolve(uri);
        })
        .catch(() => resolve(""));
    });
    input.click();
  });
}

async function boot() {
  if (!readPass()) await askForPass();
  await start({
    driver: new WebDriver(),
    save,
    blank: await findBlank(),
    onNeedBlank: pickBlank,
  });
}
void boot();
