/**
 * Dev utility: render a filled order form from a blank, to eyeball the result.
 *
 *   npx tsx scripts/render-sample.ts <blank-image> <out.pdf>
 *
 * The blank is supplied as an argument because real forms are gitignored —
 * see samples/README.md and ADR 0004. Uses synthetic decedent details only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { compose } from "../src/lib/inscription.js";
import { hebrewDateOfDeath } from "../src/lib/hebrew-date.js";
import { renderForm } from "../src/lib/form-render.js";
import { decodeLine } from "../src/lib/form-table.js";

const [blankPath, outPath = "out.pdf"] = process.argv.slice(2);
if (!blankPath) {
  console.error("usage: tsx scripts/render-sample.ts <blank-image> [out.pdf]");
  process.exit(1);
}

const lines = compose(
  {
    gender: "female",
    hebrewGiven: "שרה",
    hebrewFather: "אברהם",
    englishGiven: "Sarah",
    englishFather: "Abraham",
    death: hebrewDateOfDeath(new Date(2024, 0, 25), "daytime"),
  },
  {
    hebrew: "אשת חיל ואם יקרה",
    english: "a woman of valour and a dear mother",
    pronunciation: "EH-shet CHA-yil v'EM ye-ka-RAH",
  },
);

for (const l of lines) {
  const ok = decodeLine(l.boxes) === l.hebrew ? "round-trips" : "MISMATCH";
  console.log(
    `${l.hebrew.padEnd(20)} ${String(l.boxes.length).padStart(2)}/28  ${ok}  ${l.english}`,
  );
}

const out = await renderForm(readFileSync(blankPath), lines.map((l) => l.boxes), {
  cleanScan: true,
});
console.log(`\ngrid: ${out.grid.rows.length} rows × ${out.grid.rows[0]!.rules.length - 1} boxes`);
console.log(`boxes filled: ${out.boxesFilled}`);
writeFileSync(outPath, out.pdf);
console.log(`wrote ${outPath}`);
