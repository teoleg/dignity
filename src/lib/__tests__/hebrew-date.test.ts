import { describe, it, expect } from "vitest";
import { hebrewDateOfDeath, isBlocking } from "../hebrew-date.js";
import { encodeLine } from "../form-table.js";
import { hasNikud } from "../hebrew-text.js";

/** Synthetic house examples — see CLAUDE.md. Never a real order. */
const JAN_13 = new Date(2024, 0, 13);
const JAN_25 = new Date(2024, 0, 25);

const resolved = (d: Date, when: "daytime" | "after-sunset") => {
  const r = hebrewDateOfDeath(d, when);
  if (r.status !== "resolved") throw new Error("expected a resolved date");
  return r.hebrew;
};

/**
 * Every month, encodable and encoded correctly.
 *
 * hebcal renders month names pointed, and the dagesh used to survive. Kislev,
 * Iyyar, Tamuz and Elul came out with כּ, יּ, מּ, וּ — characters the form has
 * no code for — so a death in those months could not be put on the form at
 * all. Tishrei and Tamuz were the dangerous case: the pointed תּ encodes as
 * code 1 where plain ת is code 29, and nothing complained.
 */
describe("every Hebrew month reaches the form", () => {
  // A leap year (13 months) and a common year, every day-of-month shape.
  for (const year of [2024, 2025, 2026, 2027]) {
    it(`encodes every month of ${year}`, () => {
      for (let m = 0; m < 12; m++) {
        for (const day of [1, 10, 15, 16, 22, 28]) {
          const { text } = resolved(new Date(year, m, day), "daytime");
          const enc = encodeLine(`נ״פ ${text}`);
          if (!enc.ok) {
            throw new Error(
              `${year}-${m + 1}-${day} gives "${text}", refused: ` +
                enc.unrepresentable.map((u) => `${u.char} ${u.codepoint}`).join(", "),
            );
          }
          // No pointed form may reach the form: they are different codes.
          expect(text).not.toMatch(/\u05BC/);
        }
      }
    });
  }

  it("spells Kislev with a plain kaf", () => {
    // 12 Dec 2025 is in Kislev. Synthetic date, no real order.
    expect(resolved(new Date(2025, 11, 12), "daytime").text).toContain("כסלו");
  });

  it("spells Tishrei with plain tav, which is code 29 and not code 1", () => {
    const t = resolved(new Date(2025, 9, 1), "daytime").text;
    expect(t).toContain("תשרי");
    const enc = encodeLine("תשרי");
    if (!enc.ok) throw new Error("Tishrei should encode");
    expect(enc.boxes[0]).toBe(29);
  });
});

describe("gematria", () => {
  it("writes a single-letter day with a geresh", () => {
    expect(resolved(JAN_13, "daytime").text).toBe("ג׳ שבט תשפ״ד");
  });

  it("writes 15 as tet-vav, never yod-he", () => {
    const t = resolved(JAN_25, "daytime").text;
    expect(t).toBe("ט״ו שבט תשפ״ד");
    expect(t).not.toContain("י״ה");
  });

  it("writes 16 as tet-zayin, never yod-vav", () => {
    // 25 Jan after sunset is the 16th — the trap and the sunset rule at once.
    const t = resolved(JAN_25, "after-sunset").text;
    expect(t).toBe("ט״ז שבט תשפ״ד");
    expect(t).not.toContain("י״ו");
  });

  it("writes the year in minor reckoning, without the thousands", () => {
    expect(resolved(JAN_25, "daytime").text).toContain("תשפ״ד");
    expect(resolved(JAN_25, "daytime").text).not.toContain("ה׳תשפ״ד");
  });
});

describe("the form cannot carry vowel points", () => {
  it("renders month names unpointed", () => {
    // hebcal returns `שְׁבָט`; anything pointed reaches the encoder and fails.
    const t = resolved(JAN_25, "daytime").text;
    expect(hasNikud(t)).toBe(false);
    expect(t).toContain("שבט");
  });

  it("produces a date line the encoder accepts", () => {
    const r = encodeLine(`נ״פ ${resolved(JAN_25, "daytime").text}`);
    expect(r.ok).toBe(true);
  });
});

describe("the sunset rule", () => {
  it("moves an evening death to the next Hebrew day", () => {
    expect(resolved(JAN_25, "daytime").day).toBe(15);
    expect(resolved(JAN_25, "after-sunset").day).toBe(16);
  });

  it("can roll into the next Hebrew month", () => {
    // Find a civil date whose Hebrew day is the last of its month.
    let d = new Date(2024, 0, 1);
    for (let i = 0; i < 400; i++) {
      const a = resolved(d, "daytime");
      const b = resolved(d, "after-sunset");
      if (a.monthEnglish !== b.monthEnglish) {
        expect(b.day).toBe(1);
        return;
      }
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    throw new Error("no month boundary found in a year of dates");
  });
});

describe("unknown time of death", () => {
  it("resolves nothing and returns both candidates", () => {
    const r = hebrewDateOfDeath(JAN_25, "unknown");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      expect(r.ifDaytime.text).toBe("ט״ו שבט תשפ״ד");
      expect(r.ifAfterSunset.text).toBe("ט״ז שבט תשפ״ד");
      // One character apart, and a family that cannot read Hebrew has no way
      // to tell them apart — which is the whole argument for blocking.
      expect(r.ifDaytime.text).not.toBe(r.ifAfterSunset.text);
    }
  });

  it("blocks", () => {
    expect(isBlocking(hebrewDateOfDeath(JAN_25, "unknown"))).toBe(true);
    expect(isBlocking(hebrewDateOfDeath(JAN_25, "daytime"))).toBe(false);
  });
});

describe("leap years", () => {
  it("names Adar I and Adar II distinctly", () => {
    // 5784 is a leap year; both Adars occur.
    const seen = new Set<string>();
    let d = new Date(2024, 1, 1);
    for (let i = 0; i < 90; i++) {
      seen.add(resolved(d, "daytime").monthEnglish);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    expect(seen.has("Adar I")).toBe(true);
    expect(seen.has("Adar II")).toBe(true);
  });
});
