/**
 * Finding the box grid on the vendor's blank form.
 *
 * ADR 0004: we never redraw the form. The blank is the template and we draw
 * nothing but numbers on top of it. That means the box positions have to be
 * measured from the image rather than hard-coded, so a replacement blank — a
 * cleaner scan, a revised form — needs no re-measuring by hand.
 *
 * It also means a mis-detected grid would put every number in the wrong box,
 * silently. So detection asserts the shape it expects and throws otherwise.
 */

import { BOXES_PER_LINE, LINES_PER_FORM } from "./form-table.js";

export interface Greyscale {
  /** One byte per pixel, row-major. */
  data: Uint8Array | Buffer;
  width: number;
  height: number;
}

export interface BoxRow {
  /** Top and bottom of the row of boxes, in pixels. */
  top: number;
  bottom: number;
  /** x of each vertical rule: BOXES_PER_LINE + 1 of them, left to right. */
  rules: number[];
}

export interface FormGrid {
  width: number;
  height: number;
  /** Exactly LINES_PER_FORM rows, top to bottom. */
  rows: BoxRow[];
}

export class GridDetectionError extends Error {
  constructor(message: string) {
    super(`form grid not recognised: ${message}`);
    this.name = "GridDetectionError";
  }
}

export interface DetectOptions {
  /** Below this is "ink". */
  inkThreshold?: number;
  /** Fraction of a span that must be ink for a line to count as a rule. */
  coverage?: number;
  /** Plausible box-row heights, as a fraction of image height. */
  minRowHeight?: number;
  maxRowHeight?: number;
}

const DEFAULTS = {
  inkThreshold: 140,
  coverage: 0.55,
  minRowHeight: 0.03,
  maxRowHeight: 0.09,
} as const;

/** Group adjacent indices into runs and return the centre of each. */
function centresOfRuns(indices: number[], gap = 3): number[] {
  if (indices.length === 0) return [];
  const out: number[] = [];
  let start = indices[0]!;
  let prev = indices[0]!;
  for (const i of indices.slice(1)) {
    if (i - prev > gap) {
      out.push(Math.round((start + prev) / 2));
      start = i;
    }
    prev = i;
  }
  out.push(Math.round((start + prev) / 2));
  return out;
}

/**
 * Locate the five rows of boxes on a blank form.
 *
 * Throws unless it finds exactly LINES_PER_FORM rows of BOXES_PER_LINE boxes
 * with an even pitch. A grid that is nearly right is the dangerous case, so
 * "nearly" is rejected too.
 */
export function detectGrid(img: Greyscale, opts: DetectOptions = {}): FormGrid {
  const o = { ...DEFAULTS, ...opts };
  const { data, width, height } = img;
  if (width < BOXES_PER_LINE * 4 || height < 40) {
    throw new GridDetectionError(`image is too small at ${width}×${height}`);
  }
  const ink = (x: number, y: number) => (data[y * width + x] as number) < o.inkThreshold;

  // Horizontal rules: rows of pixels that are mostly ink.
  const hRules: number[] = [];
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (ink(x, y)) n++;
    if (n > width * o.coverage) hRules.push(y);
  }
  const rules = centresOfRuns(hRules, 4);
  if (rules.length < 2) {
    throw new GridDetectionError(`found ${rules.length} horizontal rules, need at least 2`);
  }

  // A box row is the gap between two horizontal rules, of plausible height.
  const minH = height * o.minRowHeight;
  const maxH = height * o.maxRowHeight;
  const rows: BoxRow[] = [];
  for (let i = 0; i < rules.length - 1; i++) {
    const top = rules[i]!;
    const bottom = rules[i + 1]!;
    const h = bottom - top;
    if (h < minH || h > maxH) continue;
    const verticals = verticalRulesIn(ink, width, top, bottom, o.coverage);
    if (verticals.length !== BOXES_PER_LINE + 1) continue;
    rows.push({ top, bottom, rules: verticals });
  }

  if (rows.length !== LINES_PER_FORM) {
    throw new GridDetectionError(
      `found ${rows.length} rows of ${BOXES_PER_LINE} boxes, expected ${LINES_PER_FORM}`,
    );
  }
  for (const [i, row] of rows.entries()) assertEvenPitch(row, i);
  return { width, height, rows };
}

function verticalRulesIn(
  ink: (x: number, y: number) => boolean,
  width: number,
  top: number,
  bottom: number,
  coverage: number,
): number[] {
  const y0 = top + 4;
  const y1 = bottom - 4;
  const span = y1 - y0;
  if (span <= 0) return [];
  const cols: number[] = [];
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = y0; y < y1; y++) if (ink(x, y)) n++;
    if (n > span * coverage) cols.push(x);
  }
  return centresOfRuns(cols, 3);
}

/**
 * The boxes are evenly spaced on the real form, so uneven pitch means the
 * detector has locked onto something else — a line of the header, a pencil
 * mark, a table elsewhere on the page.
 */
function assertEvenPitch(row: BoxRow, index: number): void {
  const gaps = row.rules.slice(1).map((x, i) => x - row.rules[i]!);
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  if (min <= 0) throw new GridDetectionError(`row ${index} has a zero-width box`);
  if (max / min > 1.25) {
    throw new GridDetectionError(
      `row ${index} box widths vary from ${min}px to ${max}px; the grid is not even`,
    );
  }
}

export interface BoxPlacement {
  row: number;
  /** 0 = leftmost printed box. */
  column: number;
  /** Pixel centre, for drawing. */
  x: number;
  y: number;
  code: number;
}

/**
 * Where each code goes, for a whole form.
 *
 * `linesOfBoxes[i]` is line i in logical order (first character first). The
 * form is filled **right to left**, so the first character lands in the
 * rightmost box — the one place in the codebase that knows this is
 * `form-table.layOutRightToLeft`, and this function defers to it.
 */
export function placeBoxes(
  grid: FormGrid,
  rows: readonly (readonly (number | null)[])[],
): BoxPlacement[] {
  if (rows.length > grid.rows.length) {
    throw new RangeError(`${rows.length} lines for a form with ${grid.rows.length}`);
  }
  const out: BoxPlacement[] = [];
  rows.forEach((laidOut, r) => {
    const row = grid.rows[r]!;
    const y = Math.round((row.top + row.bottom) / 2);
    laidOut.forEach((code, c) => {
      if (code === null || code === undefined) return;
      const left = row.rules[c];
      const right = row.rules[c + 1];
      if (left === undefined || right === undefined) return;
      out.push({ row: r, column: c, x: Math.round((left + right) / 2), y, code });
    });
  });
  return out;
}
