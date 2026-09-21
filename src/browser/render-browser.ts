/**
 * Filling the form in a browser.
 *
 * The server renderer uses sharp; a browser cannot. But `form-grid.ts` is
 * pure — it takes `{data, width, height}` greyscale bytes — and canvas
 * produces exactly that, so grid detection is the *same tested code* here.
 * Only decoding and drawing differ.
 *
 * The output here is a picture, not a PDF: it is meant to land in a phone's
 * photo library, which is somewhere the family can find it again, print from
 * and keep a history in. `src/lib/form-render.ts` still produces the PDF for
 * anything server-side.
 */

import { detectGrid, placeBoxes, type FormGrid, type Greyscale } from "../lib/form-grid.js";
import { layOutRightToLeft, type Box } from "../lib/form-table.js";

/** Decode an image to greyscale bytes, optionally dropping pencil and haze. */
export async function prepareBlank(
  src: Blob | string,
  clean = false,
): Promise<{ grey: Greyscale; png: Blob; canvas: HTMLCanvasElement }> {
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
  return { grey: { data: grey, width: canvas.width, height: canvas.height }, png, canvas };
}

export interface RenderedImage {
  png: Uint8Array;
  grid: FormGrid;
  boxesFilled: number;
  width: number;
  height: number;
}

/**
 * The same filled form as a picture.
 *
 * A phone can keep a picture in its photo library, print it from there, and
 * show a history of what was saved. A PDF on a phone goes somewhere less
 * obvious. The numbers are drawn straight onto the blank — the vendor's
 * artwork is still the template (ADR 0004) — on a canvas scaled up so the
 * digits stay legible when the picture is printed.
 */
export async function renderImage(
  blank: Blob | string,
  lines: readonly (readonly Box[])[],
  opts: { cleanScan?: boolean; minWidth?: number } = {},
): Promise<RenderedImage> {
  const { grey, canvas: src } = await prepareBlank(blank, opts.cleanScan ?? false);
  const grid = detectGrid(grey); // throws unless it really is the form

  // Upscale before drawing, not after: the digits are drawn at the larger
  // size rather than being magnified, so printing stays sharp.
  const scale = Math.max(1, Math.min(4, (opts.minWidth ?? 2400) / src.width));
  const out = document.createElement("canvas");
  out.width = Math.round(src.width * scale);
  out.height = Math.round(src.height * scale);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, out.width, out.height);

  const placements = placeBoxes(grid, lines.map((l) => layOutRightToLeft(l)));
  const size = Math.max(8, (grid.rows[0]!.bottom - grid.rows[0]!.top) * scale * 0.5);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  for (const p of placements) ctx.fillText(String(p.code), p.x * scale, p.y * scale);

  const blob = await new Promise<Blob>((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  );
  return {
    png: new Uint8Array(await blob.arrayBuffer()),
    grid,
    boxesFilled: placements.length,
    width: out.width,
    height: out.height,
  };
}
