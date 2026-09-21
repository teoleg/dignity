import { describe, it, expect } from "vitest";
import {
  translateLine,
  translateName,
  looksDivergent,
  type RawCandidate,
  type RawName,
  type TranslationModel,
  type TranslationRequest,
} from "../translation.js";
import { decodeLine, BOXES_PER_LINE } from "../form-table.js";

/**
 * A stub model. The point of injecting the model is that every safety
 * property can be tested without a network call — including the ones that
 * only matter when the model misbehaves.
 */
function stub(opts: {
  candidates?: RawCandidate[];
  names?: RawName[];
  back?: (hebrew: string) => string;
  onBackTranslate?: (hebrew: string) => void;
}): TranslationModel {
  return {
    async propose() {
      return opts.candidates ?? [];
    },
    async backTranslate(hebrew: string) {
      opts.onBackTranslate?.(hebrew);
      return opts.back ? opts.back(hebrew) : "our dear mother";
    },
    async proposeName() {
      return opts.names ?? [];
    },
  };
}

const req: TranslationRequest = { english: "our dear mother", gender: "female" };

const good: RawCandidate = {
  hebrew: "אמנו היקרה",
  pronunciation: "i-ME-nu ha-ye-ka-RA",
  meaning: "our dear mother",
};

describe("vetting what the model returns", () => {
  it("accepts a candidate the form can carry", async () => {
    const r = await translateLine(stub({ candidates: [good] }), req);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
    expect(decodeLine(r.accepted[0]!.boxes)).toBe(good.hebrew);
  });

  it("rejects niqqud rather than stripping it", async () => {
    // Silently correcting a family's inscription is the failure we exist to
    // prevent — so this must be refused, not repaired.
    const pointed = { ...good, hebrew: "אִמֵּנוּ" };
    const r = await translateLine(stub({ candidates: [pointed] }), req);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]?.reason).toContain("no character for");
  });

  it("rejects Yiddish diacritics", async () => {
    const r = await translateLine(stub({ candidates: [{ ...good, hebrew: "אַמא" }] }), req);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]?.reason).toContain("U+05B7");
  });

  it("rejects a line that will not fit, and says by how much", async () => {
    const long = { ...good, hebrew: "א".repeat(BOXES_PER_LINE + 3) };
    const r = await translateLine(stub({ candidates: [long] }), req);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]?.reason).toContain(String(BOXES_PER_LINE + 3));
    expect(r.rejected[0]?.reason).toContain(String(BOXES_PER_LINE));
  });

  it("respects a shorter line when one is asked for", async () => {
    const r = await translateLine(stub({ candidates: [good] }), { ...req, maxBoxes: 5 });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]?.reason).toContain("the line holds 5");
  });

  it("keeps the good candidates when only some fail", async () => {
    const r = await translateLine(
      stub({ candidates: [{ ...good, hebrew: "אַמא" }, good] }),
      req,
    );
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
  });

  it("rejects Latin text", async () => {
    const r = await translateLine(stub({ candidates: [{ ...good, hebrew: "our mother" }] }), req);
    expect(r.accepted).toHaveLength(0);
  });

  it("returns nothing when the model offers nothing", async () => {
    const r = await translateLine(stub({ candidates: [] }), req);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(0);
  });
});

describe("the back-translation is an independent check", () => {
  it("is produced from the Hebrew alone", async () => {
    // If the request reached this call the gloss would restate the intent
    // instead of checking it, and the whole round trip would be theatre.
    const seen: string[] = [];
    await translateLine(
      stub({ candidates: [good], onBackTranslate: (h) => seen.push(h) }),
      req,
    );
    expect(seen).toEqual([good.hebrew]);
    expect(seen[0]).not.toContain(req.english);
  });

  it("is reported separately from the model's own gloss", async () => {
    const r = await translateLine(
      stub({ candidates: [good], back: () => "our precious mother" }),
      req,
    );
    expect(r.accepted[0]?.meaning).toBe("our dear mother"); // forward gloss
    expect(r.accepted[0]?.backTranslation).toBe("our precious mother"); // independent
  });

  it("flags a back-translation about something else", async () => {
    const r = await translateLine(
      stub({ candidates: [good], back: () => "a righteous man of Jerusalem" }),
      req,
    );
    expect(r.accepted[0]?.possibleDrift).toBe(true);
  });

  it("does not flag a wording difference that shares substance", async () => {
    const r = await translateLine(
      stub({ candidates: [good], back: () => "mother, dearly loved" }),
      req,
    );
    expect(r.accepted[0]?.possibleDrift).toBe(false);
  });
});

describe("the drift heuristic", () => {
  it("ignores stopwords and plurals", () => {
    expect(looksDivergent("our dear mothers", "the mother who was dear")).toBe(false);
  });

  it("catches no overlap at all", () => {
    expect(looksDivergent("the heart of our family", "a crown of glory")).toBe(true);
  });

  it("stays quiet when there is nothing to compare", () => {
    // Better silent than confidently wrong: it is a hint, not a verdict.
    expect(looksDivergent("", "anything")).toBe(false);
    expect(looksDivergent("our mother", "")).toBe(false);
  });
});

describe("names", () => {
  const sarah: RawName = { hebrew: "שרה", pronunciation: "SA-ra" };

  it("are always marked as needing confirmation", async () => {
    const r = await translateName(stub({ names: [sarah] }), "Sarah", "decedent");
    expect(r.accepted[0]?.needsConfirmation).toBe(true);
  });

  it("are never back-translated — a name has no meaning to check", async () => {
    let called = false;
    await translateName(
      stub({ names: [sarah], onBackTranslate: () => { called = true; } }),
      "Sarah",
      "decedent",
    );
    expect(called).toBe(false);
  });

  it("carry a pronunciation, which is the only check a non-reader can make", async () => {
    const r = await translateName(stub({ names: [sarah] }), "Sarah", "decedent");
    expect(r.accepted[0]?.pronunciation).toBe("SA-ra");
  });

  it("keep a note when the Hebrew is not a transliteration", async () => {
    const r = await translateName(
      stub({ names: [{ hebrew: "צבי", pronunciation: "TZVI", note: "traditional for Harry" }] }),
      "Harry",
      "decedent",
    );
    expect(r.accepted[0]?.note).toContain("Harry");
  });

  it("are vetted against the form like anything else", async () => {
    const r = await translateName(
      stub({ names: [{ hebrew: "אַבּא", pronunciation: "AB-ba" }] }),
      "Abba",
      "father",
    );
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]?.reason).toContain("no character for");
  });
});
