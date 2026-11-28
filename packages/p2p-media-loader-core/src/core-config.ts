import type { Debugger } from "debug";
import { diagnostics } from "./diagnostics.js";
import type { CommonCoreConfig, CoreConfig, StreamConfig } from "./types.js";
import { TRACKER_CLIENT_VERSION_PREFIX } from "./utils/peer.js";
import { filterUndefinedProps, mergeAndFilterConfig } from "./utils/utils.js";

/**
 * Config keys a major release renamed or removed, each with its counter and
 * the reason it is ignored. The config merge keeps only known keys, so an old
 * one would vanish without a word; a caller in plain JavaScript, or with a
 * config object that is not a literal, gets no compile error for it. Each is
 * reported instead, and never carried over: the meaning of a renamed key can
 * change with it.
 */
const OBSOLETE_CONFIG_KEYS: Readonly<
  Record<
    string,
    { counter: "Config:renamed-key" | "Config:removed-key"; reason: string }
  >
> = {
  highDemandTimeWindow: {
    counter: "Config:renamed-key",
    reason:
      'it is renamed "urgentBufferThreshold", and its meaning changed. Choose a value for "urgentBufferThreshold"',
  },
  streamSwarmIdBuilder: {
    counter: "Config:renamed-key",
    reason:
      'it is renamed "streamIdBuilder", which returns only the stream ID; the core adds the protocol version and the swarm ID. A prefix such as a tenant moves to the stream ID: streamIdBuilder: ({ defaultStreamId }) => `tenant-a-${defaultStreamId}`',
  },
  validateHTTPSegment: {
    counter: "Config:removed-key",
    reason:
      "it is removed. HTTP is trusted. A download that holds a peer's bytes is validated with validateP2PSegment, whichever source finishes it",
  },
};

/**
 * Stream config keys that cannot change at runtime: stream identity, read
 * once when a stream is registered, and the segment filter, read once when
 * the registry is made.
 */
const STATIC_ONLY_KEYS = [
  "swarmId",
  "streamIdBuilder",
  "segmentFilter",
] as const;
type StaticOnlyKey = (typeof STATIC_ONLY_KEYS)[number];

/** Default configuration for common core settings. */
export const DEFAULT_COMMON_CORE_CONFIG: CommonCoreConfig = {
  segmentMemoryStorageLimit: undefined,
  customSegmentStorageFactory: undefined,
  trackerClientVersionPrefix: TRACKER_CLIENT_VERSION_PREFIX,
};

/** Default configuration for stream settings. */
export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  isP2PUploadDisabled: false,
  isP2PDisabled: false,
  simultaneousHttpDownloads: 2,
  simultaneousP2PDownloads: 3,
  urgentBufferThreshold: undefined,
  httpDownloadInitialTimeoutMs: 0,
  httpDownloadTimeWindow: 3000,
  p2pDownloadTimeWindow: 6000,
  webRtcMaxMessageSize: 64 * 1024 - 1,
  p2pNotReceivingBytesTimeoutMs: 2000,
  p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000,
  httpNotReceivingBytesTimeoutMs: 3000,
  httpFirstByteTimeoutMs: 10000,
  httpErrorRetries: 3,
  p2pErrorRetries: 3,
  announceTrackers: [
    "wss://tracker.novage.com.ua",
    "wss://tracker.webtorrent.dev",
    "wss://tracker.openwebtorrent.com",
  ],
  rtcConfig: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  },
  validateP2PSegment: undefined,
  httpRequestSetup: undefined,
  swarmId: undefined,
  streamIdBuilder: undefined,
  segmentFilter: undefined,
  p2pMaxPeers: 50,
  p2pChurnMaxPeersMultiplier: 1.5,
  p2pChurnCleanupIntervalMs: 30000,
  p2pChurnGracePeriodMs: 15000,
  webRtcOffersCount: 5,
  webRtcOfferTimeoutMs: 50000,
  webRtcIceGatheringTimeoutMs: 5000,
  webRtcConnectionTimeoutMs: 15000,
};

/**
 * The three configs a core works from, each the defaults overridden by what
 * the integrator passed: the top level, then the stream type's own object.
 */
export function mergeCoreConfig(config: Partial<CoreConfig> | undefined): {
  common: CommonCoreConfig;
  main: StreamConfig;
  secondary: StreamConfig;
} {
  const filteredConfig = filterUndefinedProps(config ?? {});
  return {
    common: mergeAndFilterConfig<CommonCoreConfig>({
      defaultConfig: DEFAULT_COMMON_CORE_CONFIG,
      baseConfig: filteredConfig,
    }),
    main: mergeAndFilterConfig<StreamConfig>({
      defaultConfig: DEFAULT_STREAM_CONFIG,
      baseConfig: filteredConfig,
      specificStreamConfig: filteredConfig.mainStream,
    }),
    secondary: mergeAndFilterConfig<StreamConfig>({
      defaultConfig: DEFAULT_STREAM_CONFIG,
      baseConfig: filteredConfig,
      specificStreamConfig: filteredConfig.secondaryStream,
    }),
  };
}

/**
 * Warns once for each renamed or removed key a config still names, at its
 * top level or in `mainStream` or `secondaryStream`: the key is ignored.
 * For a renamed key the integrator has to choose a value for the new one;
 * for a removed one, the warning says what replaces it.
 */
export function reportObsoleteConfigKeys(
  config: unknown,
  reported: Set<string>,
): void {
  if (typeof config !== "object" || config === null) return;
  const levels = [config as Record<string, unknown>];
  for (const key of ["mainStream", "secondaryStream"]) {
    const nested = (config as Record<string, unknown>)[key];
    if (typeof nested === "object" && nested !== null) {
      levels.push(nested as Record<string, unknown>);
    }
  }
  for (const level of levels) {
    for (const oldKey of Object.keys(OBSOLETE_CONFIG_KEYS)) {
      if (!(oldKey in level) || reported.has(oldKey)) {
        continue;
      }
      const { counter, reason } = OBSOLETE_CONFIG_KEYS[oldKey];
      reported.add(oldKey);
      diagnostics?.count(counter);
      // eslint-disable-next-line no-console
      console.warn(
        `[p2p-media-loader] The config key "${oldKey}" is ignored: ${reason}; see https://github.com/Novage/p2p-media-loader/blob/main/MIGRATION.md`,
      );
    }
  }
}

/**
 * The config without the keys that cannot change at runtime; each one passed
 * is logged as ignored.
 */
export function stripStaticOnlyProps<T extends object>(
  config: T,
  logger: Debugger,
): Omit<T, StaticOnlyKey> {
  const passed = STATIC_ONLY_KEYS.filter((key) => key in config);
  if (!passed.length) return config;

  // TypeScript excludes these properties from DynamicCoreConfig, but
  // plain-JS callers can still pass them — signal instead of silently
  // ignoring the update.
  logger(
    `${passed.join(", ")} cannot be changed at runtime; ignoring them in the dynamic configuration update`,
  );

  const sanitized = { ...config } as T &
    Partial<Record<StaticOnlyKey, unknown>>;
  delete sanitized.swarmId;
  delete sanitized.streamIdBuilder;
  delete sanitized.segmentFilter;
  return sanitized;
}
