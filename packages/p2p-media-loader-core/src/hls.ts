/**
 * HLS manifest parser entry point: `import { hlsManifestParser } from
 * "p2p-media-loader-core/hls"`. Kept out of the main entry so an integration
 * that never plays HLS never bundles m3u8-parser. Pass it to the core in
 * `CoreConfig.manifestParsers`. See specs/packaging.md.
 *
 * @module p2p-media-loader-core/hls
 */
export { hlsManifestParser } from "./manifest/hls.js";
export type { ManifestParser } from "./manifest/types.js";
