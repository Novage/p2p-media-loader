/**
 * The core: manifest registry, loaders, P2P, playback tracking. Imports no
 * manifest parser — pick those from `p2p-media-loader-core/hls` and
 * `p2p-media-loader-core/dash` so a deployment carries only what it plays.
 *
 * Its exports come in two groups. The API is what an integrator configures
 * and calls. **Integration** is what every player adapter shares — where a
 * live player is placed, how far ahead it may fetch, and how a media
 * element's playback is reported — so that adapters size a player by one
 * rule rather than one each; it is for whoever writes an adapter, the
 * bundled ones included.
 *
 * @module p2p-media-loader-core
 */
export { Core } from "./core.js";
/** @internal Shared by the engine packages; see its declaration. */
export { runAll } from "./run-all.js";
export * from "./types.js";
export * from "./playback.js";
export type {
  ManifestClock,
  ManifestParseContext,
  ManifestParser,
  ManifestProtocol,
  ParsedManifest,
  ParsedStream,
  ParsedSegment,
  ParsedInitSegment,
  SegmentIndexSource,
  UtcTimingSource,
} from "./manifest/types.js";
export type { SegmentStorage } from "./segment-storage/index.js";
export {
  byteRangeFromHalfOpen,
  byteRangeFromRangeHeader,
} from "./manifest/url-key.js";
/** @internal Shared by the engine packages; see its declaration. */
export { downloadTimeMs } from "./download-time.js";
export {
  DEFAULT_HIGH_DEMAND_TIME_WINDOW,
  INITIAL_LIVE_DELAY,
  highDemandWindowFor,
  liveDelayFor,
  liveDelayForSegments,
  liveDelayFromWindow,
  maxLiveLatencyFor,
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
