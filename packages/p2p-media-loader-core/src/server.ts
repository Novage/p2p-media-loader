/**
 * Server-side stream identity helpers (`p2p-media-loader-core/server`).
 *
 * This entry point is environment-agnostic (no DOM dependencies; requires
 * Node.js 16+ for the global `btoa` and `TextEncoder`) and lets a server
 * reproduce the exact identity values clients compute for a stream — for
 * example, to allowlist the announced infohashes on a private tracker, or to
 * ask a tracker for the statistics of each quality.
 *
 * The package is published as ESM only. From a CommonJS project, load it
 * with a dynamic import (works on all supported Node.js versions):
 * ```typescript
 * const { computeInfoHash } = await import("p2p-media-loader-core/server");
 * ```
 * (Node.js 20.17+ can also `require()` it directly.)
 *
 * With the default client configuration, a stream's ID comes from the
 * manifest: for HLS its type and its index among the master's streams of that
 * type, for DASH its type and its Representation `@id`
 * (see specs/segment-identity.md):
 * ```typescript
 * import { buildStreamSwarmId, computeInfoHash } from "p2p-media-loader-core/server";
 *
 * // swarmId: the configured swarmId, or the manifest URL without its query.
 * const hls720p = computeInfoHash(buildStreamSwarmId(swarmId, "main1"));
 * const dashAudio = computeInfoHash(buildStreamSwarmId(swarmId, "secondary-audio-en"));
 * ```
 *
 * With a custom `streamIdBuilder`, pass the ID the builder returns on the
 * client.
 *
 * @module p2p-media-loader-core/server
 */
export {
  buildStreamSwarmId,
  computeInfoHash,
  PEER_PROTOCOL_VERSION,
} from "./stream-identity.js";

export type {
  ManifestStreamInfo,
  StreamIdBuilderContext,
  StreamProperties,
  StreamType,
} from "./types.js";
