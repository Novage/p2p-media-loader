import { Core } from "p2p-media-loader-core";

/** Replaced with `false` in the prebuilt bundles; see specs/diagnostics.md. */
declare const __P2PML_DIAGNOSTICS__: boolean | undefined;

/**
 * The core's diagnostics ledger, or `undefined` in a prebuilt bundle: there
 * the minifier removes each `diagnostics?.…` call along with its arguments.
 *
 * @internal
 */
export const diagnostics: typeof Core.diagnostics =
  typeof __P2PML_DIAGNOSTICS__ === "undefined" || __P2PML_DIAGNOSTICS__
    ? Core.diagnostics
    : undefined;
