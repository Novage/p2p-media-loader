// Loads each entry point the published package exports, from the build in
// lib/, with Node's own ES module loader: what a script, a test tool or a
// server that imports the package does. Vitest cannot catch an import that
// Node rejects, because it transforms the imports. Run it after the build.
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
for (const [entry, { import: file }] of Object.entries(
  pkg.publishConfig.exports,
)) {
  // It stands in for @xmldom/xmldom in browser bundles, with the browser's
  // own DOMParser; in Node, mpd-parser uses @xmldom/xmldom itself.
  if (entry === "./shims/xmldom") continue;
  await import(new URL(`../${file}`, import.meta.url));
  console.log(`${entry}: ${file} loads`);
}
