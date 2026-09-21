import { describe, it, expect } from "vitest";
import {
  detectGrid,
  placeBoxes,
  GridDetectionError,
  type Greyscale,
} from "../form-grid.js";
import {
  encodeLine,
  layOutRightToLeft,
  BOXES_PER_LINE,
  LINES_PER_FORM,
  type Box,
} from "../form-table.js";

/**
 * A synthetic blank form.
 *
 * Deliberately not the vendor's artwork: real forms are gitignored, and a
 * generated blank keeps these tests hermetic and lets us produce shapes the
 * detector must reject.
 */
interface BlankOptions {
  rows?: number;
  boxes?: number;
  width?: number;
  height?: number;
  rowHeight?: number;
  /** Make one box narrower than the rest, to break the pitch. */
  skewRow?: number;
  /** Extra full-width rule that is not a box row (a header underline). */
  decoyRule?: boolean;
}

function makeBlank(o: BlankOptions = {}): Greyscale {
  const width = o.width ?? 1254;
  const height = o.height ?? 1015;
  const rows = o.rows ?? LINES_PER_FORM;
  const boxes = o.boxes ?? BOXES_PER_LINE;
  const rowHeight = o.rowHeight ?? 48;
  const data = new Uint8Array(width * height).fill(255);

  const hline = (y: number) => {
    for (let x = 10; x < width - 10; x++) data[y * width + x] = 0;
  };
  const vline = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) data[y * width + x] = 0;
  };

  if (o.decoyRule) hline(60);

  const left = 17;
  const right = width - 71;
  let y = 200;
  for (let r = 0; r < rows; r++) {
    const top = y;
    const bottom = y + rowHeight;
    hline(top);
    hline(bottom);
    const pitch = (right - left) / boxes;
    for (let c = 0; c <= boxes; c++) {
      let x = Math.round(left + c * pitch);
      // Squeeze one box so the pitch check has something to catch.
      if (o.skewRow === r && c === 1) x = Math.round(left + pitch * 0.4);
      vline(x, top + 1, bottom - 1);
    }
    y = bottom + 30;
  }
  return { data, width, height };
}

describe("detecting the grid", () => {
  it("finds five rows of twenty-eight boxes", () => {
    const grid = detectGrid(makeBlank());
    expect(grid.rows).toHaveLength(LINES_PER_FORM);
    for (const row of grid.rows) {
      expect(row.rules).toHaveLength(BOXES_PER_LINE + 1);
      expect(row.bottom).toBeGreaterThan(row.top);
    }
  });

  it("returns rows in top-to-bottom order", () => {
    const grid = detectGrid(makeBlank());
    const tops = grid.rows.map((r) => r.top);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
  });

  it("ignores a full-width rule that is not a box row", () => {
    expect(detectGrid(makeBlank({ decoyRule: true })).rows).toHaveLength(LINES_PER_FORM);
  });
});

describe("refusing a grid that is not the form", () => {
  // A mis-detected grid puts every number in the wrong box, silently. Each of
  // these must throw rather than return something nearly right.

  it("throws when there are too few rows", () => {
    expect(() => detectGrid(makeBlank({ rows: 4 }))).toThrow(GridDetectionError);
  });

  it("throws when there are too many rows", () => {
    expect(() => detectGrid(makeBlank({ rows: 6 }))).toThrow(GridDetectionError);
  });

  it("throws when a row has the wrong number of boxes", () => {
    expect(() => detectGrid(makeBlank({ boxes: 27 }))).toThrow(GridDetectionError);
    expect(() => detectGrid(makeBlank({ boxes: 30 }))).toThrow(GridDetectionError);
  });

  it("throws when the box pitch is uneven", () => {
    expect(() => detectGrid(makeBlank({ skewRow: 2 }))).toThrow(/not even/);
  });

  it("throws on a blank page", () => {
    const blank: Greyscale = { data: new Uint8Array(400 * 400).fill(255), width: 400, height: 400 };
    expect(() => detectGrid(blank)).toThrow(GridDetectionError);
  });

  it("throws on an image too small to be a form", () => {
    const tiny: Greyscale = { data: new Uint8Array(20 * 20).fill(255), width: 20, height: 20 };
    expect(() => detectGrid(tiny)).toThrow(/too small/);
  });
});

describe("placing numbers in boxes", () => {
  const boxesOf = (s: string): Box[] => {
    const r = encodeLine(s);
    if (!r.ok) throw new Error("unexpected refusal");
    return r.boxes;
  };

  it("puts the first character in the rightmost box", () => {
    const grid = detectGrid(makeBlank());
    const placed = placeBoxes(grid, [layOutRightToLeft(boxesOf("פ״נ"))]);
    const byColumn = [...placed].sort((a, b) => a.column - b.column);
    // פ=22 ״=31 נ=18 laid out right to left: 18, 31, 22 across the page.
    expect(byColumn.map((p) => p.code)).toEqual([18, 31, 22]);
    expect(byColumn.at(-1)!.column).toBe(BOXES_PER_LINE - 1);
  });

  it("skips spaces rather than drawing in them", () => {
    const grid = detectGrid(makeBlank());
    const text = "שרה בת אברהם";
    const placed = placeBoxes(grid, [layOutRightToLeft(boxesOf(text))]);
    const nonSpace = boxesOf(text).filter((b) => b !== null).length;
    expect(placed).toHaveLength(nonSpace);
  });

  it("places x centres inside their own box", () => {
    const grid = detectGrid(makeBlank());
    const placed = placeBoxes(grid, [layOutRightToLeft(boxesOf("תנצב״ה"))]);
    for (const p of placed) {
      const row = grid.rows[p.row]!;
      expect(p.x).toBeGreaterThan(row.rules[p.column]!);
      expect(p.x).toBeLessThan(row.rules[p.column + 1]!);
      expect(p.y).toBeGreaterThan(row.top);
      expect(p.y).toBeLessThan(row.bottom);
    }
  });

  it("keeps lines on their own rows", () => {
    const grid = detectGrid(makeBlank());
    const placed = placeBoxes(grid, [
      layOutRightToLeft(boxesOf("פ״נ")),
      layOutRightToLeft(boxesOf("תנצב״ה")),
    ]);
    const rowsUsed = new Set(placed.map((p) => p.row));
    expect([...rowsUsed].sort()).toEqual([0, 1]);
    const ys = [0, 1].map((r) => placed.find((p) => p.row === r)!.y);
    expect(ys[1]!).toBeGreaterThan(ys[0]!);
  });

  it("refuses more lines than the form has rows", () => {
    const grid = detectGrid(makeBlank());
    const six = Array.from({ length: 6 }, () => layOutRightToLeft(boxesOf("א")));
    expect(() => placeBoxes(grid, six)).toThrow(RangeError);
  });

  it("round-trips: numbers read off the page reproduce the Hebrew", () => {
    // The end-to-end check that matters — what a person would do holding the
    // printed form, reading the boxes from the right.
    const grid = detectGrid(makeBlank());
    const text = "נ״פ ט״ו שבט תשפ״ד";
    const laidOut = layOutRightToLeft(boxesOf(text));
    const placed = placeBoxes(grid, [laidOut]);
    const read: Box[] = new Array(BOXES_PER_LINE).fill(null);
    for (const p of placed) read[p.column] = p.code;
    expect(read).toEqual(laidOut);
  });
});
