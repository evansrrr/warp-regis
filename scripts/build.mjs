#!/usr/bin/env node
/**
 * Bundles the Worker into a single, self-contained ES module that can be pasted
 * into the Cloudflare dashboard or uploaded anywhere else.
 *
 *   node scripts/build.mjs [--no-minify] [--outfile dist/worker.js]
 *
 * Everything is bundled with esbuild: no runtime imports, no node built-ins,
 * `target: es2022` (the Workers runtime), minified, no source map.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const ROOT = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const minify = !args.includes("--no-minify");
const outfileFlag = args.indexOf("--outfile");
const outfile = resolve(
  ROOT,
  outfileFlag >= 0 ? (args[outfileFlag + 1] ?? "dist/worker.js") : "dist/worker.js",
);

const result = await build({
  absWorkingDir: ROOT,
  entryPoints: ["src/index.ts"],
  outfile,
  bundle: true,
  write: false,
  format: "esm",
  target: ["es2022"],
  platform: "neutral",
  mainFields: ["module", "main"],
  conditions: ["workerd", "worker", "browser"],
  minify,
  legalComments: "none",
  charset: "utf8",
  treeShaking: true,
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "/* warp-regis — Cloudflare Worker bundle */" },
  logLevel: "warning",
});

const [output] = result.outputFiles;
const code = output.text;

// Guard: a Workers module must be self-contained.
if (/^\s*import\s/m.test(code)) {
  throw new Error("bundle still contains import statements; it would not run as a single file");
}

await mkdir(dirname(outfile), { recursive: true });
await writeFile(outfile, code, "utf8");

const { size } = await stat(outfile);
const gzip = gzipSync(Buffer.from(code)).byteLength;
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

console.log(`built ${outfile.replace(`${ROOT}/`, "")}`);
console.log(`  raw    ${kib(size)}`);
console.log(`  gzip   ${kib(gzip)}`);
console.log(`  minify ${minify ? "on" : "off"}`);

const FREE_PLAN_LIMIT = 1024 * 1024;
if (size > FREE_PLAN_LIMIT) {
  throw new Error(`bundle exceeds the 1 MiB Workers free-plan limit (${kib(size)})`);
}
