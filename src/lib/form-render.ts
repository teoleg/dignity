/**
 * Rendering the filled order form.
 *
 * ADR 0004: the vendor's blank is the template. This module draws numbers on
 * top of it and nothing else — no logo, no headings, no box grid of our own.
 * A redraw was prototyped and rejected; it was recognisably not their form.
 *
 * The blank is an asset supplied at runtime, not committed. Real forms are
 * gitignored (see samples/README.md), and in production the blank is stored
 * per `order.form_revision` so a form revision is a new asset rather than a
 * code change.
 */

import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { detectGrid, placeBoxes, type FormGrid, type Greyscale } from "./form-grid.js";
import { layOutRightToLeft, type Box } from "./form-table.js";

/** US Letter, landscape, in points. The form is a landscape sheet. */
export const PAGE = { width: 792, height: 612 } as const;

export interface RenderOptions {
  /** Points of white space around the form image. */
  margin?: number;
  /**
   * Remove faint pencil marks and scan haze from a used blank, keeping ink
   * and the printed colour bars. Harmless on a clean original.
   */
  cleanScan?: boolean;
  /** Only for showing a family which boxes we filled; the vendor gets black. */
  inkColour?: { r: number; g: number; b: number };
}

export interface RenderedForm {
  pdf: Uint8Array;
  grid: FormGrid;
  /** How many boxes carried a number. */
  boxesFilled: number;
}

/**
 * Decode a blank to greyscale for grid detection, and optionally clean it.
 *
 * Cleaning drops pixels that are light and unsaturated — pencil, paper
 * texture, scanner haze — while keeping black print and the form's orange
 * bars. It never touches anything dark, so it cannot erase a rule the
 * detector needs.
 */
export async function prepareBlank(
  blank: Uint8Array | Buffer,
  clean = false,
): Promise<{ grey: Greyscale; image: Buffer }> {
  let pipeline = sharp(blank);
  if (clean) {
    const { data, info } = await pipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = Buffer.from(data);
    for (let i = 0; i < px.length; i += info.channels) {
      const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
      const min = Math.min(r, g, b);
      const sat = Math.max(r, g, b) - min;
      if (min > 150 && sat < 45) {
        px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
      }
    }
    pipeline = sharp(px, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });
  }
  const image = await pipeline.png().toBuffer();
  const { data, info } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { grey: { data, width: info.width, height: info.height }, image };
}

/**
 * Produce the filled form.
 *
 * `lines` are in logical order (first character first); this function applies
 * the right-to-left layout, so callers pass the inscription as it reads.
 */
export async function renderForm(
  blank: Uint8Array | Buffer,
  lines: readonly (readonly Box[])[],
  opts: RenderOptions = {},
): Promise<RenderedForm> {
  const margin = opts.margin ?? 18;
  const ink = opts.inkColour ?? { r: 0, g: 0, b: 0 };

  const { grey, image } = await prepareBlank(blank, opts.cleanScan ?? false);
  const grid = detectGrid(grey); // throws unless it is really the form

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const png = await pdf.embedPng(image);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  const scale = Math.min(
    (PAGE.width - 2 * margin) / grid.width,
    (PAGE.height - 2 * margin) / grid.height,
  );
  const drawW = grid.width * scale;
  const drawH = grid.height * scale;
  const originX = (PAGE.width - drawW) / 2;
  const originY = (PAGE.height - drawH) / 2;

  page.drawImage(png, { x: originX, y: originY, width: drawW, height: drawH });

  const placements = placeBoxes(grid, lines.map((l) => layOutRightToLeft(l)));
  const size = Math.max(6, Math.round(grid.rows[0]!.bottom - grid.rows[0]!.top) * scale * 0.42);

  for (const p of placements) {
    const text = String(p.code);
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      // PDF's y grows upward; the grid's grows downward.
      x: originX + p.x * scale - w / 2,
      y: originY + (grid.height - p.y) * scale - size * 0.36,
      size,
      font,
      color: rgb(ink.r, ink.g, ink.b),
    });
  }

  return { pdf: await pdf.save(), grid, boxesFilled: placements.length };
}
