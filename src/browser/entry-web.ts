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
  try {
    return localStorage.getItem(BLANK_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Ask the viewer for the blank, and remember it on this device. */
function pickBlank(): Promise<string> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onload = () => {
        const uri = String(reader.result ?? "");
        try {
          localStorage.setItem(BLANK_KEY, uri);
        } catch {
          /* too large for storage: still usable this session */
        }
        resolve(uri);
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
    // Cancel leaves no event on some browsers; the viewer can press again.
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
