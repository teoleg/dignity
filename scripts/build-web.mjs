/**
 * Bundle the hosted page, stamping in the build time and commit.
 *
 * The stamp is shown in the UI so "is my change live?" is answerable by
 * looking, rather than by guessing whether a phone has cached the old file.
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";

const sha = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
})();
const stamp = `${new Date().toISOString().slice(5, 16).replace("T", " ")} ${sha}`;

await build({
  entryPoints: ["src/browser/entry-web.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: "public/app.js",
  define: { __BUILD__: JSON.stringify(stamp) },
});
console.log(`built public/app.js  ${stamp}`);
