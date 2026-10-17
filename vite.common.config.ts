import { fileURLToPath } from "node:url";
import type { AliasOptions } from "vite";

const shim = (name: string) =>
  fileURLToPath(
    new URL(
      `./packages/p2p-media-loader-core/src/manifest/shims/${name}.ts`,
      import.meta.url,
    ),
  );

/**
 * Module substitutions for browser bundles. The manifest parsers import a
 * Node-compatible XML parser and a Babel helper that browsers do not need;
 * both are replaced by platform builtins. Applied at build time only, so
 * tests running in Node resolve the real packages. See specs/packaging.md.
 */
export const browserBundleAliases: AliasOptions = {
  "@xmldom/xmldom": shim("dom-parser"),
  "@babel/runtime/helpers/extends": shim("extends"),
};

/**
 * Build-time constants for the prebuilt bundles. The diagnostics ledger is
 * compiled out of every bundle built here: `diagnostics` becomes `undefined`,
 * and the minifier removes each `diagnostics?.…` call with its arguments. The
 * `tsc` output in `lib/`, the tests and the demo keep it. See
 * specs/diagnostics.md.
 */
export const bundleDefines: Record<string, string> = {
  __P2PML_DIAGNOSTICS__: "false",
};
