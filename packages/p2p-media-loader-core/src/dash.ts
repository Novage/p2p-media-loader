/**
 * DASH manifest parser entry point: `import { dashManifestParser } from
 * "p2p-media-loader-core/dash"`. Kept out of the main entry so an integration
 * that never plays DASH never bundles mpd-parser. See specs/packaging.md.
 */
export { dashManifestParser } from "./manifest/dash.js";
export type { ManifestParser } from "./manifest/types.js";
