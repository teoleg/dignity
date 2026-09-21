/**
 * Filling the form in a browser.
 *
 * The server renderer uses sharp; a browser cannot. But `form-grid.ts` is
 * pure — it takes `{data, width, height}` greyscale bytes — and canvas
 * produces exactly that, so grid detection is the *same tested code* here.
 * Only decoding and drawing differ.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { detectGrid, placeBoxes, type FormGrid, type Greyscale } from "../lib/form-grid.js";
import { layOutRightToLeft, type Box } from "../lib/form-table.js";

export const PAGE = { width: 792, height: 612 } as const;

/** Decode an image to greyscale bytes, optionally dropping pencil and haze. */
export async function prepareBlank(
  src: Blob | string,
  clean = false,
): Promise<{ grey: Greyscale; png: Blob }> {
  const bitmap = await createImageBitmap(
    typeof src === "string" ? await (await fetch(src)).blob() : src,
  );
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  if (clean) {
    // Same rule as the server: light AND unsaturated only, so no rule the
    // detector needs can be erased.
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]!, g = px[i + 1]!, b = px[i + 2]!;
      const min = Math.min(r, g, b);
      if (min > 150 && Math.max(r, g, b) - min < 45) {
        px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const grey = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // Rec. 601 luma, matching sharp's greyscale closely enough for a
    // threshold at 140.
    grey[j] = (px[i]! * 299 + px[i + 1]! * 587 + px[i + 2]! * 114) / 1000;
  }
  const png = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  );
  return { grey: { data: grey, width: canvas.width, height: canvas.height }, png };
}

export interface RenderedForm {
  pdf: Uint8Array;
  grid: FormGrid;
  boxesFilled: number;
}

/** Draw the numbers onto the vendor's blank. Nothing else is drawn. */
export async function renderForm(
  blank: Blob | string,
  lines: readonly (readonly Box[])[],
  opts: { margin?: number; cleanScan?: boolean } = {},
): Promise<RenderedForm> {
  const margin = opts.margin ?? 18;
  const { grey, png } = await prepareBlank(blank, opts.cleanScan ?? false);
  const grid = detectGrid(grey); // throws unless it really is the form

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const image = await pdf.embedPng(await png.arrayBuffer());
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  const scale = Math.min(
    (PAGE.width - 2 * margin) / grid.width,
    (PAGE.height - 2 * margin) / grid.height,
  );
  const drawW = grid.width * scale;
  const drawH = grid.height * scale;
  const originX = (PAGE.width - drawW) / 2;
  const originY = (PAGE.height - drawH) / 2;
  page.drawImage(image, { x: originX, y: originY, width: drawW, height: drawH });

  const placements = placeBoxes(grid, lines.map((l) => layOutRightToLeft(l)));
  const size = Math.max(6, (grid.rows[0]!.bottom - grid.rows[0]!.top) * scale * 0.42);
  for (const p of placements) {
    const text = String(p.code);
    page.drawText(text, {
      x: originX + p.x * scale - font.widthOfTextAtSize(text, size) / 2,
      y: originY + (grid.height - p.y) * scale - size * 0.36,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
  return { pdf: await pdf.save(), grid, boxesFilled: placements.length };
}
