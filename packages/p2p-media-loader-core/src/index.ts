/**
 * The core: manifest registry, loaders, P2P, playback tracking. Imports no
 * manifest parser — pick those from `p2p-media-loader-core/hls` and
 * `p2p-media-loader-core/dash` so a deployment carries only what it plays.
 *
 * @module p2p-media-loader-core
 */
export { Core } from "./core.js";
export { runAll } from "./run-all.js";
export * from "./types.js";
export * from "./playback.js";
export type {
  ManifestParser,
  ManifestProtocol,
  ParsedManifest,
  ParsedStream,
  ParsedSegment,
  ParsedInitSegment,
  SegmentIndexSource,
} from "./manifest/types.js";
export type { SegmentStorage } from "./segment-storage/index.js";
export { byteRangeFromRangeHeader } from "./manifest/url-key.js";
export { downloadTimeMs } from "./download-time.js";
export {
  DEFAULT_HIGH_DEMAND_TIME_WINDOW,
  INITIAL_LIVE_DELAY,
  highDemandWindowFor,
  liveDelayFor,
  liveDelayForSegments,
  liveDelayFromWindow,
  playerBufferFor,
  type LiveDelay,
} from "./live-delay.js";
export {
  computeStreamIdentityHash,
  identityProperties,
  computeStreamSwarmId,
  buildStreamSwarmId,
  computeInfoHash,
  PEER_PROTOCOL_VERSION,
} from "./stream-identity.js";
export { debug } from "debug";
