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

/** A plain anchor download — no capability needed off-platform. */
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
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

async function boot() {
  if (!readPass()) await askForPass();
  await start({
    driver: new WebDriver(),
    save,
    blank: "/blank-form.jpg",
  });
}
void boot();
