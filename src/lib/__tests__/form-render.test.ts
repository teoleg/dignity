import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderForm, prepareBlank, PAGE } from "../form-render.js";
import { GridDetectionError } from "../form-grid.js";
import { compose, type Decedent } from "../inscription.js";
import { hebrewDateOfDeath } from "../hebrew-date.js";
import { BOXES_PER_LINE, LINES_PER_FORM, encodeLine, type Box } from "../form-table.js";

/**
 * A synthetic blank as a real PNG. The vendor's form is gitignored, and a
 * generated one keeps this hermetic and lets us render a blank the detector
 * must reject.
 */
async function blankPng(opts: { rows?: number; pencil?: boolean } = {}): Promise<Buffer> {
  const width = 1254;
  const height = 1015;
  const rows = opts.rows ?? LINES_PER_FORM;
  const px = Buffer.alloc(width * height * 3, 255);
  const set = (x: number, y: number, v: [number, number, number]) => {
    const i = (y * width + x) * 3;
    px[i] = v[0]; px[i + 1] = v[1]; px[i + 2] = v[2];
  };
  const black: [number, number, number] = [0, 0, 0];

  let y = 200;
  for (let r = 0; r < rows; r++) {
    const top = y, bottom = y + 48;
    for (let x = 10; x < width - 10; x++) { set(x, top, black); set(x, bottom, black); }
    const left = 17, right = width - 71, pitch = (right - left) / BOXES_PER_LINE;
    for (let c = 0; c <= BOXES_PER_LINE; c++) {
      const cx = Math.round(left + c * pitch);
      for (let yy = top + 1; yy < bottom; yy++) set(cx, yy, black);
    }
    y = bottom + 30;
  }
  if (opts.pencil) {
    // Faint, unsaturated grey — what a used form carries.
    for (let x = 300; x < 700; x++) set(x, 120, [196, 198, 200]);
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const sarah = (): Decedent => ({
  gender: "female",
  hebrewGiven: "שרה",
  hebrewFather: "אברהם",
  englishGiven: "Sarah",
  englishFather: "Abraham",
  death: hebrewDateOfDeath(new Date(2024, 0, 25), "daytime"),
});

const boxesOf = (s: string): Box[] => {
  const r = encodeLine(s);
  if (!r.ok) throw new Error("unexpected refusal");
  return r.boxes;
};

describe("rendering the filled form", () => {
  it("produces a PDF", async () => {
    const out = await renderForm(await blankPng(), [boxesOf("פ״נ")]);
    expect(out.pdf.byteLength).toBeGreaterThan(1000);
    // %PDF- magic
    expect(Buffer.from(out.pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("fills one box per non-space character", async () => {
    const lines = compose(sarah()).map((l) => l.boxes);
    const expected = lines.flat().filter((b) => b !== null).length;
    const out = await renderForm(await blankPng(), lines);
    expect(out.boxesFilled).toBe(expected);
  });

  it("detects the grid from the blank rather than assuming it", async () => {
    const out = await renderForm(await blankPng(), [boxesOf("א")]);
    expect(out.grid.rows).toHaveLength(LINES_PER_FORM);
    expect(out.grid.rows[0]!.rules).toHaveLength(BOXES_PER_LINE + 1);
  });

  it("refuses a blank whose grid is not the form", async () => {
    // Would otherwise put every number in the wrong box, silently.
    await expect(renderForm(await blankPng({ rows: 4 }), [boxesOf("א")])).rejects.toThrow(
      GridDetectionError,
    );
  });

  it("refuses more lines than the form holds", async () => {
    const six = Array.from({ length: 6 }, () => boxesOf("א"));
    await expect(renderForm(await blankPng(), six)).rejects.toThrow(RangeError);
  });

  it("refuses a line longer than the form holds", async () => {
    const long = boxesOf("א".repeat(BOXES_PER_LINE + 1));
    await expect(renderForm(await blankPng(), [long])).rejects.toThrow(RangeError);
  });

  it("puts the page on US Letter landscape", async () => {
    const out = await renderForm(await blankPng(), [boxesOf("א")]);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(out.pdf);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(PAGE.width);
    expect(Math.round(height)).toBe(PAGE.height);
    expect(width).toBeGreaterThan(height);
  });
});

describe("cleaning a used blank", () => {
  it("removes faint pencil without disturbing the grid", async () => {
    const dirty = await blankPng({ pencil: true });
    const before = await prepareBlank(dirty, false);
    const after = await prepareBlank(dirty, true);

    const pencilRow = (g: { data: Uint8Array | Buffer; width: number }) => {
      let ink = 0;
      for (let x = 300; x < 700; x++) if ((g.data[120 * g.width + x] as number) < 220) ink++;
      return ink;
    };
    expect(pencilRow(before.grey)).toBeGreaterThan(300);
    expect(pencilRow(after.grey)).toBe(0);

    // Grid still detected, unchanged.
    const out = await renderForm(dirty, [boxesOf("פ״נ")], { cleanScan: true });
    expect(out.grid.rows).toHaveLength(LINES_PER_FORM);
  });
});
