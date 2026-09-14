/**
 * DASH manifest parser entry point: `import { dashManifestParser } from
 * "p2p-media-loader-core/dash"`. Kept out of the main entry so an integration
 * that never plays DASH never bundles mpd-parser. Pass it to the core in
 * `CoreConfig.manifestParsers`. See specs/packaging.md.
 *
 * @module p2p-media-loader-core/dash
 */
export { dashManifestParser } from "./manifest/dash.js";
export type { ManifestParser } from "./manifest/types.js";
