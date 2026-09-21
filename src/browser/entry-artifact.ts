/** Entry for the claude.ai artifact build: model via `sample`, file via `downloads`. */
import { start } from "./app.js";
import { BrowserConversation } from "./ask-claude.js";

const NO_CLAUDE = `<p>This page needs Claude to run the conversation, and it is not available here.</p>
  <p class="hint">Open it from your Claude account — the link works there.</p>`;

async function boot() {
  const sample = (await window.claude?.use("sample")) as
    | { json<T>(i: unknown, o?: Record<string, unknown>): Promise<T> }
    | null
    | undefined;
  const downloads = (await window.claude?.use("downloads")) as
    | { save(o: { filename: string; data: Uint8Array }): Promise<unknown> }
    | null
    | undefined;

  await start({
    driver: sample
      ? new BrowserConversation(sample)
      : { advance: () => Promise.reject(new Error("no sample")) },
    save: async (filename, data) => {
      if (!downloads) throw new Error("downloads unavailable");
      await downloads.save({ filename, data });
    },
    blank: window.DIGNITY_BLANK ?? "",
    ...(sample ? {} : { unavailable: NO_CLAUDE }),
  });
}
void boot();
