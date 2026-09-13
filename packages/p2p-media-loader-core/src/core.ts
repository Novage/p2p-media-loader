import { HybridLoader } from "./hybrid-loader.js";
import type { PlaybackState } from "./playback.js";
import type { ManifestParser, ManifestProtocol } from "./manifest/types.js";
import { ManifestRegistry, type RegistryStream } from "./manifest/registry.js";
import {
  computeDivergence,
  type ManifestDivergenceDetails,
} from "./manifest/divergence.js";
import debug from "debug";
import {
  Stream,
  CoreConfig,
  Segment,
  CoreEventMap,
  DynamicCoreConfig,
  EngineCallbacks,
  CommonCoreConfig,
  StreamConfig,
  DefinedCoreConfig,
  StreamRegistration,
  StreamProperties,
  StreamType,
  DynamicStreamConfig,
} from "./types.js";
import {
  BandwidthCalculators,
  StreamDetails,
  StreamWithSegments,
  SegmentWithStream,
} from "./internal-types.js";
import * as StreamUtils from "./utils/stream.js";
import {
  buildStreamSwarmId,
  computeInfoHash,
  computeStreamIdentityHash,
  PEER_PROTOCOL_VERSION,
} from "./stream-identity.js";
import { BandwidthCalculator } from "./bandwidth-calculator.js";
import { SegmentMemoryStorage } from "./segment-storage/segment-memory-storage.js";
import { EventTarget } from "./utils/event-target.js";
import {
  overrideConfig,
  mergeAndFilterConfig,
  deepCopy,
  filterUndefinedProps,
} from "./utils/utils.js";
import { TRACKER_CLIENT_VERSION_PREFIX, generatePeerId } from "./utils/peer.js";
import { SegmentStorage } from "./segment-storage/index.js";
import { WebTorrentSocketPool } from "./webtorrent/webtorrent-socket-pool/index.js";

/** Core class for managing media streams loading via P2P. */
export class Core<TStream extends Stream = Stream> {
  /** Default configuration for common core settings. */
  static readonly DEFAULT_COMMON_CORE_CONFIG: CommonCoreConfig = {
    segmentMemoryStorageLimit: undefined,
    customSegmentStorageFactory: undefined,
    trackerClientVersionPrefix: TRACKER_CLIENT_VERSION_PREFIX,
  };

  /** Default configuration for stream settings. */
  static readonly DEFAULT_STREAM_CONFIG: StreamConfig = {
    isP2PUploadDisabled: false,
    isP2PDisabled: false,
    simultaneousHttpDownloads: 2,
    simultaneousP2PDownloads: 3,
    highDemandTimeWindow: 15,
    httpDownloadInitialTimeoutMs: 0,
    httpDownloadTimeWindow: 3000,
    p2pDownloadTimeWindow: 6000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 2000,
    p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000,
    httpNotReceivingBytesTimeoutMs: 3000,
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
    validateHTTPSegment: undefined,
    httpRequestSetup: undefined,
    swarmId: undefined,
    streamSwarmIdBuilder: undefined,
    p2pMaxPeers: 50,
    p2pChurnMaxPeersMultiplier: 1.5,
    p2pChurnCleanupIntervalMs: 30000,
    p2pChurnGracePeriodMs: 15000,
    webRtcOffersCount: 5,
    webRtcOfferTimeoutMs: 50000,
    webRtcIceGatheringTimeoutMs: 5000,
    webRtcConnectionTimeoutMs: 15000,
  };

  private readonly eventTarget = new EventTarget<CoreEventMap>();
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private mainStreamConfig: StreamConfig;
  private secondaryStreamConfig: StreamConfig;
  private commonCoreConfig: CommonCoreConfig;
  private readonly bandwidthCalculators: BandwidthCalculators = {
    all: new BandwidthCalculator(),
    http: new BandwidthCalculator(),
  };
  private segmentStorage?: SegmentStorage;
  private readonly webTorrentSocketPool = new WebTorrentSocketPool();
  private readonly logger = debug("p2pml-core:core");
  private readonly socketPoolLogger = debug(
    "p2pml-core:webtorrent-socket-pool",
  );
  private readonly peerId: string;
  private mainStreamLoader?: HybridLoader;
  private secondaryStreamLoader?: HybridLoader;
  private streamDetails: StreamDetails = {
    isLive: false,
    activeLevelBitrate: 0,
  };
  private storageInitPromise?: Promise<void>;
  private readonly manifestParsers: readonly ManifestParser[];
  private manifestRegistry = new ManifestRegistry();
  private readonly manifestLogger = debug("p2pml-core:manifest");
  private lastManifestUrl?: string;
  private divergenceLogTimer?: ReturnType<typeof setTimeout>;

  /**
   * Constructs a new Core instance with optional initial configuration.
   *
   * @param config - Optional partial configuration to override default settings.
   *
   * @example
   * // Create a Core instance with custom configuration for HTTP and P2P downloads.
   * const core = new Core({
   *   simultaneousHttpDownloads: 5,
   *   simultaneousP2PDownloads: 5,
   *   httpErrorRetries: 5,
   *   p2pErrorRetries: 5
   * });
   *
   * @example
   * // Create a Core instance using the default configuration.
   * const core = new Core();
   */
  constructor(config?: Partial<CoreConfig>) {
    const filteredConfig = filterUndefinedProps(config ?? {});

    this.commonCoreConfig = mergeAndFilterConfig<CommonCoreConfig>({
      defaultConfig: Core.DEFAULT_COMMON_CORE_CONFIG,
      baseConfig: filteredConfig,
    });

    this.mainStreamConfig = mergeAndFilterConfig<StreamConfig>({
      defaultConfig: Core.DEFAULT_STREAM_CONFIG,
      baseConfig: filteredConfig,
      specificStreamConfig: filteredConfig.mainStream,
    });

    this.secondaryStreamConfig = mergeAndFilterConfig<StreamConfig>({
      defaultConfig: Core.DEFAULT_STREAM_CONFIG,
      baseConfig: filteredConfig,
      specificStreamConfig: filteredConfig.secondaryStream,
    });

    this.peerId = generatePeerId(
      this.commonCoreConfig.trackerClientVersionPrefix,
    );

    // Parsers are capabilities, not tunables: kept as given, outside the
    // merged config, so they are never deep-copied or surfaced by getConfig().
    this.manifestParsers = config?.manifestParsers ?? [];

    this.webTorrentSocketPool.addEventListener("error", (error, url) => {
      this.socketPoolLogger(`WebSocket error for tracker url ${url}:`, error);
    });
  }

  /**
   * Retrieves the current configuration for the core instance, ensuring immutability.
   *
   * @returns A deep readonly version of the core configuration.
   */
  getConfig(): DefinedCoreConfig {
    return {
      ...deepCopy(this.commonCoreConfig),
      mainStream: deepCopy(this.mainStreamConfig),
      secondaryStream: deepCopy(this.secondaryStreamConfig),
    };
  }

  /**
   * Applies a set of dynamic configuration updates to the core, merging with the existing configuration.
   *
   * @param dynamicConfig - A set of configuration changes to apply.
   *
   * @example
   * // Example of dynamically updating the download time windows and timeout settings.
   * const dynamicConfig = {
   *   httpDownloadTimeWindow: 60,  // Set HTTP download time window to 60 seconds
   *   p2pDownloadTimeWindow: 60,   // Set P2P download time window to 60 seconds
   *   httpNotReceivingBytesTimeoutMs: 1500,  // Set HTTP timeout to 1500 milliseconds
   *   p2pNotReceivingBytesTimeoutMs: 1500    // Set P2P timeout to 1500 milliseconds
   * };
   * core.applyDynamicConfig(dynamicConfig);
   */
  applyDynamicConfig(dynamicConfig: DynamicCoreConfig) {
    const { mainStream, secondaryStream } = dynamicConfig;

    const mainStreamConfigCopy = deepCopy(this.mainStreamConfig);
    const secondaryStreamConfigCopy = deepCopy(this.secondaryStreamConfig);

    this.overrideAllConfigs(dynamicConfig, mainStream, secondaryStream);

    this.processSpecificDynamicConfigParams(
      mainStreamConfigCopy,
      dynamicConfig,
      "main",
    );
    this.processSpecificDynamicConfigParams(
      secondaryStreamConfigCopy,
      dynamicConfig,
      "secondary",
    );
  }

  private processSpecificDynamicConfigParams(
    prevConfig: StreamConfig,
    updatedConfig: DynamicCoreConfig,
    streamType: StreamType,
  ) {
    const isP2PDisabled = this.getUpdatedStreamProperty(
      "isP2PDisabled",
      updatedConfig,
      streamType,
    );

    if (isP2PDisabled && prevConfig.isP2PDisabled !== isP2PDisabled) {
      this.destroyStreamLoader(streamType);
    }

    const isP2PUploadDisabled = this.getUpdatedStreamProperty(
      "isP2PUploadDisabled",
      updatedConfig,
      streamType,
    );

    if (
      isP2PUploadDisabled !== undefined &&
      prevConfig.isP2PUploadDisabled !== isP2PUploadDisabled
    ) {
      const streamLoader =
        streamType === "main"
          ? this.mainStreamLoader
          : this.secondaryStreamLoader;

      streamLoader?.sendBroadcastAnnouncement(isP2PUploadDisabled);
    }
  }

  private getUpdatedStreamProperty<K extends keyof DynamicStreamConfig>(
    propertyName: K,
    updatedConfig: DynamicCoreConfig,
    streamType: StreamType,
  ): DynamicStreamConfig[K] | undefined {
    const updatedStreamConfig =
      streamType === "main"
        ? updatedConfig.mainStream
        : updatedConfig.secondaryStream;

    return updatedStreamConfig?.[propertyName] ?? updatedConfig[propertyName];
  }

  /**
   * Adds an event listener for the specified event type on the core event target.
   *
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to invoke when the event is fired.
   */
  addEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.eventTarget.addEventListener(eventName, listener);
  }

  /**
   * Removes an event listener for the specified event type on the core event target.
   *
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to be removed.
   */
  removeEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.eventTarget.removeEventListener(eventName, listener);
  }

  /**
   * Sets the response URL for the manifest, stripping any query parameters.
   *
   * @param url - The full URL to the manifest response.
   */
  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = url.split("?")[0];
  }

  /**
   * Parses a manifest the player has fetched and updates the manifest-derived
   * registry. In shadow mode that registry drives nothing. See
   * specs/manifest-registry.md.
   *
   * Never throws. A manifest with no matching parser is ignored, and a parse
   * failure leaves the registry as it was — a transient bad response must not
   * empty a working segment list.
   */
  processManifest(manifest: {
    url: string;
    /** Text, or the raw bytes a player's networking layer delivers. */
    data: string | ArrayBuffer | ArrayBufferView;
    protocol?: ManifestProtocol;
  }): void {
    const text =
      typeof manifest.data === "string"
        ? manifest.data
        : new TextDecoder().decode(manifest.data);

    const parser = manifest.protocol
      ? this.manifestParsers.find((p) => p.protocol === manifest.protocol)
      : this.manifestParsers.find((p) => p.canParse(text));
    if (!parser) {
      this.manifestLogger("no parser for manifest %s", manifest.url);
      return;
    }

    try {
      this.manifestRegistry.apply(parser.parse(text, manifest.url));
    } catch (error) {
      this.manifestLogger("failed to parse %s: %O", manifest.url, error);
      return;
    }

    this.lastManifestUrl = manifest.url;
    this.scheduleDivergenceLog();
  }

  /**
   * The adapter hands the core a manifest before the player parses the same
   * response, and the player reads segment indexes later still — for a VOD
   * manifest, after the only refresh there will ever be. Comparing shortly
   * after either side moves, and once per burst, measures disagreement rather
   * than which side saw the data first.
   */
  private scheduleDivergenceLog(): void {
    if (!this.manifestLogger.enabled || this.lastManifestUrl === undefined) {
      return;
    }
    if (this.divergenceLogTimer !== undefined) return;
    this.divergenceLogTimer = setTimeout(() => {
      this.divergenceLogTimer = undefined;
      if (this.lastManifestUrl !== undefined) {
        this.logManifestDivergence(this.lastManifestUrl);
      }
    }, 250);
  }

  /**
   * Snapshot of the manifest-derived registry. Shadow-phase diagnostic, not
   * public API: stripped from the published typings and documentation.
   * @internal
   */
  getManifestStreams(): readonly RegistryStream[] {
    return this.manifestRegistry.getStreams();
  }

  /**
   * How the manifest-derived registry differs from what the player
   * integration registered. Shadow-phase diagnostic, not public API: stripped
   * from the published typings and documentation.
   * @internal
   */
  getManifestDivergence(manifestUrl: string): ManifestDivergenceDetails {
    return computeDivergence(
      this.manifestRegistry,
      this.streams.values(),
      manifestUrl,
    );
  }

  /** `localStorage.debug = "p2pml-core:manifest"` judges the parse on a real stream. */
  private logManifestDivergence(manifestUrl: string): void {
    const divergence = this.getManifestDivergence(manifestUrl);
    const players = Array.from(this.streams.values());
    this.manifestLogger(
      "%s — registry %d streams, player %d streams (%s)",
      manifestUrl,
      divergence.streams.length,
      players.length,
      players
        .map((p) => `${p.type}#${p.runtimeId}:${p.segments.size}`)
        .join(" ") || "none",
    );
    for (const stream of divergence.streams) {
      const registryStream = this.manifestRegistry.getStream(stream.key);
      if (registryStream?.indexSource.kind === "external") {
        this.manifestLogger(
          "%s %s external index %s|%d-%d (segments arrive with it)",
          stream.type,
          stream.key,
          registryStream.indexSource.url,
          registryStream.indexSource.byteRange.start,
          registryStream.indexSource.byteRange.end,
        );
        continue;
      }
      if (
        stream.segmentsCompared === 0 &&
        stream.segmentsOnlyInManifest === 0 &&
        stream.segmentsOnlyInPlayer === 0
      ) {
        continue; // a master-declared stream with no segments on either side yet
      }
      if (!stream.playerRuntimeId && registryStream) {
        this.manifestLogger(
          "  registry sample key: %s",
          firstKey(registryStream.segments) ?? "(none)",
        );
      }
      this.manifestLogger(
        "%s %s matched=%s identity=%s compared=%d onlyManifest=%d onlyPlayer=%d idMismatch=%d offset=%.3f maxΔstart=%.3f maxΔend=%.3f",
        stream.type,
        stream.key,
        stream.playerRuntimeId ? "yes" : "NO",
        stream.identityHashMatches ?? "n/a",
        stream.segmentsCompared,
        stream.segmentsOnlyInManifest,
        stream.segmentsOnlyInPlayer,
        stream.externalIdMismatches,
        stream.timelineOffset,
        stream.maxStartTimeDelta,
        stream.maxEndTimeDelta,
      );
      if (stream.identityInputs) {
        this.manifestLogger(
          "  identity differs — manifest %o vs player %o",
          stream.identityInputs.manifest,
          stream.identityInputs.player,
        );
      }
      if (stream.manifestRange && stream.playerRange) {
        this.manifestLogger(
          "  starts — manifest [%.3f, %.3f] player [%.3f, %.3f]%s%s",
          stream.manifestRange[0],
          stream.manifestRange[1],
          stream.playerRange[0],
          stream.playerRange[1],
          stream.onlyInManifestSample
            ? ` onlyManifest e.g. ${stream.onlyInManifestSample}`
            : "",
          stream.onlyInPlayerSample
            ? ` onlyPlayer e.g. ${stream.onlyInPlayerSample}`
            : "",
        );
      }
      if (stream.sample) {
        this.manifestLogger(
          "  externalId sample — player %d vs manifest %d at %s (Δstart %.3f)",
          stream.sample.playerExternalId,
          stream.sample.manifestExternalId,
          stream.sample.key,
          stream.sample.startTimeDelta,
        );
      }
    }
    for (const runtimeId of divergence.unmatchedPlayerStreams) {
      const player = this.streams.get(runtimeId);
      if (!player) continue;
      const sample = firstKey(player.segments);
      this.manifestLogger(
        "player stream with no manifest match: %s#%s identity=%s segments=%d sample key: %s props=%o",
        player.type,
        runtimeId,
        player.identityHash,
        player.segments.size,
        sample ?? "(none)",
        player.properties,
      );
    }
  }

  /**
   * Checks if a segment is already stored within the core.
   *
   * @param segmentRuntimeId - The runtime identifier of the segment to check.
   * @returns `true` if the segment is present, otherwise `false`.
   */
  hasSegment(segmentRuntimeId: string): boolean {
    return !!StreamUtils.getSegmentFromStreamsMap(
      this.streams,
      segmentRuntimeId,
    );
  }

  /**
   * Retrieves a specific stream by its runtime identifier, if it exists.
   *
   * @param streamRuntimeId - The runtime identifier of the stream to retrieve.
   * @returns A detached snapshot of the registered stream with its computed
   * identity, or `undefined` if not found. The identity fields never change
   * after registration, so the snapshot stays accurate for the stream's lifetime.
   */
  getStream(streamRuntimeId: string): TStream | undefined {
    const stream = this.streams.get(streamRuntimeId);
    return stream && this.toStreamSnapshot(stream);
  }

  /**
   * Retrieves the runtime identifiers of the segments currently registered
   * for a stream. Player integrations use this to diff a refreshed manifest
   * against the core's registry before calling `updateStream`.
   *
   * @param streamRuntimeId - The runtime identifier of the stream.
   * @returns A snapshot set of the registered segment runtime IDs, or
   * `undefined` if the stream is not registered.
   */
  getStreamSegmentRuntimeIds(
    streamRuntimeId: string,
  ): ReadonlySet<string> | undefined {
    const stream = this.streams.get(streamRuntimeId);
    if (!stream) return undefined;
    return new Set(stream.segments.keys());
  }

  /**
   * Retrieves all currently registered streams with their computed identities,
   * including the infohashes announced to trackers. Unlike the `onStreamAdded`
   * event, this reflects the full set at any moment, so late subscribers can
   * catch up on streams registered before they attached.
   *
   * @returns Detached snapshots of the registered streams, in registration order.
   */
  getStreams(): TStream[] {
    return Array.from(this.streams.values(), (stream) =>
      this.toStreamSnapshot(stream),
    );
  }

  /**
   * Builds a detached snapshot of a registered stream: its identity and
   * integration-specific fields without the internal segments registry.
   * Everything the core hands out — event payloads and getters — is a
   * snapshot, so consumers can never reach or retain core state.
   */
  private toStreamSnapshot(stream: StreamWithSegments<TStream>): TStream {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { segments, ...snapshot } = stream;
    // TypeScript cannot prove that removing the segments registry from
    // StreamWithSegments<TStream> reconstructs TStream for an arbitrary subtype.
    return snapshot as unknown as TStream;
  }

  /**
   * Ensures a stream exists in the map; adds it if it does not.
   *
   * Computes the stream's identity (`swarmId`, `identityHash`, `streamSwarmId`,
   * `infoHash`) exactly once at registration and freezes it on the stream.
   * Requires the swarm ID to be resolvable: either a `swarmId` is configured
   * or `setManifestResponseUrl()` has been called.
   *
   * Never throws: a stream that fails to register (unresolvable swarm ID, or
   * an invalid or colliding custom stream swarm ID) stays unknown to the core —
   * its segments load through the player's default path without P2P — and the
   * failure is reported via the `onStreamRegistrationError` event.
   *
   * @param stream - The stream to potentially add to the map.
   */
  addStreamIfNoneExists(stream: StreamRegistration<TStream>): void {
    if (this.streams.has(stream.runtimeId)) return;

    const properties = Object.freeze({ ...stream.properties });
    try {
      this.registerStream(stream, properties);
    } catch (error) {
      this.logger("failed to register stream %s: %O", stream.runtimeId, error);
      this.eventTarget.dispatchEvent("onStreamRegistrationError", {
        runtimeId: stream.runtimeId,
        streamType: stream.type,
        properties,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  private registerStream(
    stream: StreamRegistration<TStream>,
    properties: Readonly<StreamProperties>,
  ): void {
    const config =
      stream.type === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;

    const swarmId = config.swarmId ?? this.manifestResponseUrl;
    if (swarmId === undefined) {
      throw new Error(
        "Failed to register stream: no swarmId is configured and the manifest response URL is not set. Call setManifestResponseUrl() before adding streams.",
      );
    }

    const identityHash = computeStreamIdentityHash(properties);

    let streamSwarmId = buildStreamSwarmId(swarmId, stream.type, identityHash);
    if (config.streamSwarmIdBuilder) {
      const customStreamSwarmId = config.streamSwarmIdBuilder({
        swarmId,
        runtimeId: stream.runtimeId,
        streamType: stream.type,
        properties,
        identityHash,
        defaultStreamSwarmId: streamSwarmId,
        peerProtocolVersion: PEER_PROTOCOL_VERSION,
      });

      if (customStreamSwarmId !== undefined) {
        if (
          typeof customStreamSwarmId !== "string" ||
          customStreamSwarmId === ""
        ) {
          throw new Error(
            "streamSwarmIdBuilder must return a non-empty string or undefined",
          );
        }
        streamSwarmId = customStreamSwarmId;
      }
    }

    for (const registered of this.streams.values()) {
      if (registered.streamSwarmId !== streamSwarmId) continue;
      // Sharing a stream swarm ID is only legitimate for streams with the same
      // default identity (e.g. the same rendition served from multiple CDNs).
      // A stream's identity is the whole (swarmId, type, identityHash) tuple —
      // identityHash alone excludes type and swarmId, so comparing it is not
      // enough. If any part differs, a custom builder has merged distinct
      // streams into one swarm and peers would exchange wrong-stream segments.
      if (
        registered.swarmId !== swarmId ||
        registered.type !== stream.type ||
        registered.identityHash !== identityHash
      ) {
        throw new Error(
          `streamSwarmIdBuilder produced the same stream swarm ID ("${streamSwarmId}") for streams with different identities. Peers of these streams would exchange segments of the wrong stream.`,
        );
      }
    }

    const registeredStream = {
      ...stream,
      properties,
      swarmId,
      identityHash,
      streamSwarmId,
      infoHash: computeInfoHash(streamSwarmId),
      segments: new Map<string, SegmentWithStream<TStream>>(),
      // TypeScript cannot prove that StreamRegistration<TStream> plus the
      // computed identity fields reconstructs TStream for an arbitrary subtype.
    } as unknown as StreamWithSegments<TStream>;

    this.streams.set(stream.runtimeId, registeredStream);

    this.eventTarget.dispatchEvent("onStreamAdded", {
      stream: this.toStreamSnapshot(registeredStream),
    });
  }

  /**
   * Updates the segments associated with a specific stream.
   *
   * @param streamRuntimeId - The runtime identifier of the stream to update.
   * @param addSegments - Optional segments to add to the stream.
   * @param removeSegmentIds - Optional segment IDs to remove from the stream.
   */
  updateStream(
    streamRuntimeId: string,
    addSegments?: Iterable<Segment>,
    removeSegmentIds?: Iterable<string>,
  ): void {
    const stream = this.streams.get(streamRuntimeId);
    if (!stream) return;

    if (addSegments) {
      for (const segment of addSegments) {
        if (stream.segments.has(segment.runtimeId)) continue; // should not happen
        stream.segments.set(segment.runtimeId, { ...segment, stream });
      }
    }

    if (removeSegmentIds) {
      for (const id of removeSegmentIds) {
        stream.segments.delete(id);
      }
    }

    this.mainStreamLoader?.updateStream(stream);
    this.secondaryStreamLoader?.updateStream(stream);
    this.scheduleDivergenceLog();
  }

  /**
   * Loads a segment given its runtime identifier and invokes the provided callbacks during the process.
   * Initializes segment storage if it has not been initialized yet.
   *
   * @param segmentRuntimeId - The runtime identifier of the segment to load.
   * @param callbacks - The callbacks to be invoked during segment loading.
   * @throws {Error} - Throws if the segment is not registered in any stream.
   */
  async loadSegment(segmentRuntimeId: string, callbacks: EngineCallbacks) {
    await this.initializeSegmentStorage();

    const segment = this.identifySegment(segmentRuntimeId);

    const loader = this.getStreamHybridLoader(segment);
    void loader.loadSegment(segment, callbacks);
  }

  /**
   * Aborts the loading of a segment specified by its runtime identifier.
   *
   * @param segmentRuntimeId - The runtime identifier of the segment whose loading is to be aborted.
   */
  abortSegmentLoading(segmentRuntimeId: string): void {
    this.mainStreamLoader?.abortSegmentRequest(segmentRuntimeId);
    this.secondaryStreamLoader?.abortSegmentRequest(segmentRuntimeId);
  }

  /**
   * Reports the player's playback state to the stream loaders.
   *
   * Only the buffer ahead of the playhead and the rate are needed — never the
   * absolute position. See `getPlaybackStateFromMediaElement` for the browser
   * case, and specs/playback-contract.md for why.
   *
   * @param state - The current playback state.
   */
  updatePlayback(state: PlaybackState): void {
    this.mainStreamLoader?.updatePlayback(state);
    this.secondaryStreamLoader?.updatePlayback(state);
  }

  /**
   * Sets the active level bitrate, used for adjusting quality levels in adaptive streaming.
   * Notifies the stream loaders if a change occurs.
   *
   * @param bitrate - The new bitrate to set as active.
   */
  setActiveLevelBitrate(bitrate: number) {
    if (bitrate !== this.streamDetails.activeLevelBitrate) {
      this.streamDetails.activeLevelBitrate = bitrate;
      this.mainStreamLoader?.notifyLevelChanged();
      this.secondaryStreamLoader?.notifyLevelChanged();
    }
  }

  /**
   * Updates the 'isLive' status of the stream
   *
   * @param isLive - Boolean indicating whether the stream is live.
   */
  setIsLive(isLive: boolean) {
    this.streamDetails.isLive = isLive;
  }

  /**
   * Identify if a segment is loadable by the P2P core based on the segment's stream type and configuration.
   * @param segmentRuntimeId Segment runtime identifier to check.
   * @returns `true` if the segment is loadable by the P2P core, otherwise `false`.
   */
  isSegmentLoadable(segmentRuntimeId: string): boolean {
    try {
      const segment = this.identifySegment(segmentRuntimeId);

      if (
        segment.stream.type === "main" &&
        this.mainStreamConfig.isP2PDisabled
      ) {
        return false;
      }

      if (
        segment.stream.type === "secondary" &&
        this.secondaryStreamConfig.isP2PDisabled
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleans up resources used by the Core instance, including destroying any active stream loaders
   * and clearing stored segments.
   *
   * Event listeners deliberately survive: the player integrations reuse one
   * Core instance across media sources, destroying it between loads, and
   * subscriptions (e.g. `onStreamAdded`, `onPeerConnect`) are expected to
   * keep working after the next source loads. Use `removeEventListener` to
   * unsubscribe explicitly.
   */
  destroy(): void {
    if (this.divergenceLogTimer !== undefined) {
      clearTimeout(this.divergenceLogTimer);
      this.divergenceLogTimer = undefined;
    }
    this.manifestRegistry = new ManifestRegistry();
    this.streams.clear();
    this.mainStreamLoader?.destroy();
    this.secondaryStreamLoader?.destroy();
    this.segmentStorage?.setSegmentChangeCallback(undefined);
    this.segmentStorage?.destroy();
    this.mainStreamLoader = undefined;
    this.secondaryStreamLoader = undefined;
    this.segmentStorage = undefined;
    this.manifestResponseUrl = undefined;
    this.streamDetails = { isLive: false, activeLevelBitrate: 0 };
    this.storageInitPromise = undefined;
    this.webTorrentSocketPool.destroy();
  }

  private async initializeSegmentStorage() {
    if (this.segmentStorage) return;
    if (this.storageInitPromise) return this.storageInitPromise;

    this.storageInitPromise = (async () => {
      const { isLive } = this.streamDetails;
      const createCustomStorage =
        this.commonCoreConfig.customSegmentStorageFactory;

      if (createCustomStorage && typeof createCustomStorage !== "function") {
        throw new Error("Storage configuration is invalid");
      }

      const segmentStorage = createCustomStorage
        ? createCustomStorage(isLive)
        : new SegmentMemoryStorage();

      try {
        await segmentStorage.initialize(
          this.commonCoreConfig,
          this.mainStreamConfig,
          this.secondaryStreamConfig,
        );
      } catch (error) {
        segmentStorage.destroy();
        throw error;
      }

      if (!this.storageInitPromise) {
        segmentStorage.setSegmentChangeCallback(undefined);
        segmentStorage.destroy();
        return;
      }

      segmentStorage.setSegmentChangeCallback((streamSwarmId: string) => {
        (
          this.eventTarget as unknown as EventTarget<
            CoreEventMap & Record<`onStorageUpdated-${string}`, () => void>
          >
        ).dispatchEvent(`onStorageUpdated-${streamSwarmId}`);
      });

      this.segmentStorage = segmentStorage;
    })();

    try {
      await this.storageInitPromise;
    } finally {
      this.storageInitPromise = undefined;
    }
  }

  private identifySegment(segmentRuntimeId: string): SegmentWithStream {
    const segment = StreamUtils.getSegmentFromStreamsMap(
      this.streams,
      segmentRuntimeId,
    );
    if (!segment) {
      throw new Error(`Not found segment with id: ${segmentRuntimeId}`);
    }

    return segment;
  }

  private overrideAllConfigs(
    dynamicConfig: DynamicCoreConfig,
    mainStream?: Partial<StreamConfig>,
    secondaryStream?: Partial<StreamConfig>,
  ) {
    // Stream identity is derived from these properties once, at stream
    // registration; changing them at runtime would silently desynchronize
    // the announced swarms from the registered streams.
    const sanitizedDynamicConfig = this.stripStaticOnlyProps(dynamicConfig);
    const sanitizedMainStream =
      mainStream && this.stripStaticOnlyProps(mainStream);
    const sanitizedSecondaryStream =
      secondaryStream && this.stripStaticOnlyProps(secondaryStream);

    overrideConfig(this.commonCoreConfig, sanitizedDynamicConfig);
    overrideConfig(this.mainStreamConfig, sanitizedDynamicConfig);
    overrideConfig(this.secondaryStreamConfig, sanitizedDynamicConfig);

    if (sanitizedMainStream) {
      overrideConfig(this.mainStreamConfig, sanitizedMainStream);
    }

    if (sanitizedSecondaryStream) {
      overrideConfig(this.secondaryStreamConfig, sanitizedSecondaryStream);
    }
  }

  private stripStaticOnlyProps<T extends object>(
    config: T,
  ): Omit<T, "swarmId" | "streamSwarmIdBuilder"> {
    if (!("swarmId" in config) && !("streamSwarmIdBuilder" in config)) {
      return config;
    }

    // TypeScript excludes these properties from DynamicCoreConfig, but
    // plain-JS callers can still pass them — signal instead of silently
    // ignoring the update.
    this.logger(
      "swarmId and streamSwarmIdBuilder cannot be changed at runtime; ignoring them in the dynamic configuration update",
    );

    const sanitized = { ...config } as T & {
      swarmId?: unknown;
      streamSwarmIdBuilder?: unknown;
    };
    delete sanitized.swarmId;
    delete sanitized.streamSwarmIdBuilder;
    return sanitized;
  }

  private destroyStreamLoader(streamType: StreamType) {
    if (streamType === "main") {
      this.mainStreamLoader?.destroy();
      this.mainStreamLoader = undefined;
    } else {
      this.secondaryStreamLoader?.destroy();
      this.secondaryStreamLoader = undefined;
    }
  }

  private getStreamHybridLoader(segment: SegmentWithStream) {
    if (segment.stream.type === "main") {
      this.mainStreamLoader ??= this.createNewHybridLoader(segment);
      return this.mainStreamLoader;
    } else {
      this.secondaryStreamLoader ??= this.createNewHybridLoader(segment);
      return this.secondaryStreamLoader;
    }
  }

  private createNewHybridLoader(segment: SegmentWithStream) {
    if (!this.segmentStorage) {
      throw new Error("Segment storage is not initialized");
    }

    const streamConfig =
      segment.stream.type === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;

    return new HybridLoader(
      segment,
      this.streamDetails,
      streamConfig,
      this.bandwidthCalculators,
      this.segmentStorage,
      this.webTorrentSocketPool,
      this.eventTarget,
      this.peerId,
    );
  }
}

function firstKey(map: ReadonlyMap<string, unknown>): string | undefined {
  for (const key of map.keys()) return key;
  return undefined;
}
