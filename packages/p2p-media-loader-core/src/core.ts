import { HybridLoader } from "./hybrid-loader.js";
import type { PlaybackState } from "./playback.js";
import type { ManifestParser, ManifestProtocol } from "./manifest/types.js";
import { ManifestRegistry, type RegistryStream } from "./manifest/registry.js";
import { segmentKey } from "./manifest/url-key.js";
import debug from "debug";
import {
  Stream,
  ByteRange,
  CoreConfig,
  CoreEventMap,
  CoreRequestError,
  DynamicCoreConfig,
  CommonCoreConfig,
  StreamConfig,
  DefinedCoreConfig,
  SegmentResponse,
  StreamProperties,
  StreamType,
  DynamicStreamConfig,
} from "./types.js";
import {
  BandwidthCalculators,
  EngineCallbacks,
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
export class Core {
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
  /** Registered streams, keyed by the manifest-derived stream key. */
  private readonly streams = new Map<string, StreamWithSegments>();
  /** Stream keys whose registration failed; reported once, then left alone. */
  private readonly failedStreamKeys = new Set<string>();
  /**
   * Initialization segments, recognised so a request for one is passed
   * through knowingly rather than counted as a registry miss. Never shared.
   * See specs/manifest-registry.md, "Initialization segments".
   */
  private readonly initSegmentKeys = new Set<string>();
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
  private streamDetails: StreamDetails = { isLive: false };
  private storageInitPromise?: Promise<void>;
  private readonly manifestParsers: readonly ManifestParser[];
  private manifestRegistry = new ManifestRegistry();
  private readonly manifestLogger = debug("p2pml-core:manifest");

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
   * Names the swarm explicitly, in place of the first manifest's response URL.
   *
   * By default the swarm ID is the URL of the first manifest handed to
   * `processManifest`, with its entire query string discarded. An integration
   * that knows a better name — one shared by every viewer regardless of CDN
   * or redirect — may set it here before the first manifest arrives, or
   * configure `swarmId` instead. See specs/segment-identity.md.
   *
   * @param url - The full URL to the manifest response.
   */
  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = stripQuery(url);
  }

  /**
   * Parses a manifest the player has fetched and brings the registry up to
   * date: streams are registered with their identity, their segments are
   * added and removed by URL key, and the live state is derived. This is the
   * only way streams and segments enter the core. See
   * specs/manifest-registry.md.
   *
   * Never throws. A manifest with no matching parser is ignored, and a parse
   * failure leaves the registry as it was — a transient bad response must not
   * empty a working segment list. Idempotent: re-processing an unchanged
   * manifest changes nothing and emits no events.
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

    let updates;
    try {
      updates = this.manifestRegistry.apply(parser.parse(text, manifest.url));
    } catch (error) {
      this.manifestLogger("failed to parse %s: %O", manifest.url, error);
      return;
    }

    // The first manifest names the swarm unless the integration already did.
    this.manifestResponseUrl ??= stripQuery(manifest.url);

    this.syncStreamsFromRegistry();

    if (this.manifestLogger.enabled) {
      this.manifestLogger(
        "%s — %d streams registered, %s",
        manifest.url,
        this.streams.size,
        updates.length
          ? updates
              .map((u) => `${u.streamKey}: +${u.added} -${u.removed}`)
              .join(", ")
          : "no segment changes",
      );
    }
  }

  /**
   * Makes the registered streams mirror the manifest registry: registers
   * streams the registry has and the core does not, and diffs every stream's
   * segments by URL key. A stream whose registration failed is skipped.
   */
  private syncStreamsFromRegistry(): void {
    let isLive = false;
    for (const registryStream of this.manifestRegistry.getStreams()) {
      isLive ||= registryStream.isLive === true;

      if (registryStream.initSegment) {
        const { url, byteRange } = registryStream.initSegment;
        this.initSegmentKeys.add(segmentKey(url, byteRange));
      }

      let stream = this.streams.get(registryStream.key);
      if (!stream) {
        if (this.failedStreamKeys.has(registryStream.key)) continue;
        stream = this.registerStream(registryStream);
        if (!stream) continue;
      }
      this.syncSegments(stream, registryStream);
    }
    this.streamDetails.isLive = isLive;
  }

  private syncSegments(
    stream: StreamWithSegments,
    registryStream: RegistryStream,
  ): void {
    let changed = false;
    for (const key of stream.segments.keys()) {
      if (!registryStream.segments.has(key)) {
        stream.segments.delete(key);
        changed = true;
      }
    }
    for (const [key, segment] of registryStream.segments) {
      if (stream.segments.has(key)) continue;
      stream.segments.set(key, {
        runtimeId: key,
        externalId: segment.externalId,
        url: segment.url,
        byteRange: segment.byteRange,
        startTime: segment.startTime,
        endTime: segment.endTime,
        stream,
      });
      changed = true;
    }
    if (!changed) return;
    this.mainStreamLoader?.updateStream(stream);
    this.secondaryStreamLoader?.updateStream(stream);
  }

  /**
   * Whether a segment request resolves against the registry.
   *
   * @param url - The URL the player is about to request.
   * @param byteRange - Its byte range, when the segment is a range of a file.
   * @returns `true` if the registry knows the segment, otherwise `false`.
   */
  hasSegment(url: string, byteRange?: ByteRange): boolean {
    return !!StreamUtils.getSegmentFromStreamsMap(
      this.streams,
      segmentKey(url, byteRange),
    );
  }

  /**
   * Retrieves a registered stream by its key, if it exists.
   *
   * @param streamRuntimeId - The stream key: the media playlist URL for HLS,
   * the Representation id for DASH.
   * @returns A detached snapshot of the registered stream with its computed
   * identity, or `undefined` if not found. The identity fields never change
   * after registration, so the snapshot stays accurate for the stream's lifetime.
   */
  getStream(streamRuntimeId: string): Stream | undefined {
    const stream = this.streams.get(streamRuntimeId);
    return stream && this.toStreamSnapshot(stream);
  }

  /**
   * Retrieves all currently registered streams with their computed identities,
   * including the infohashes announced to trackers. Unlike the `onStreamAdded`
   * event, this reflects the full set at any moment, so late subscribers can
   * catch up on streams registered before they attached.
   *
   * @returns Detached snapshots of the registered streams, in registration order.
   */
  getStreams(): Stream[] {
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
  private toStreamSnapshot(stream: StreamWithSegments): Stream {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { segments, ...snapshot } = stream;
    return snapshot;
  }

  /**
   * Registers a stream the manifest registry produced, computing its identity
   * (`swarmId`, `identityHash`, `streamSwarmId`, `infoHash`) exactly once.
   *
   * Never throws: a stream that fails to register (an invalid or colliding
   * custom stream swarm ID) stays unknown to the core — its segments load
   * through the player's default path without P2P — and the failure is
   * reported once via the `onStreamRegistrationError` event.
   */
  private registerStream(
    registryStream: RegistryStream,
  ): StreamWithSegments | undefined {
    const properties = Object.freeze({ ...registryStream.properties });
    try {
      return this.addStream(registryStream, properties);
    } catch (error) {
      this.failedStreamKeys.add(registryStream.key);
      this.logger(
        "failed to register stream %s: %O",
        registryStream.key,
        error,
      );
      this.eventTarget.dispatchEvent("onStreamRegistrationError", {
        runtimeId: registryStream.key,
        streamType: registryStream.type,
        properties,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return undefined;
    }
  }

  private addStream(
    stream: RegistryStream,
    properties: Readonly<StreamProperties>,
  ): StreamWithSegments {
    const config =
      stream.type === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;

    const swarmId = config.swarmId ?? this.manifestResponseUrl;
    if (swarmId === undefined) {
      throw new Error(
        "Failed to register stream: no swarmId is configured and no manifest has named the swarm.",
      );
    }

    const identityHash = computeStreamIdentityHash(properties);

    let streamSwarmId = buildStreamSwarmId(swarmId, stream.type, identityHash);
    if (config.streamSwarmIdBuilder) {
      const customStreamSwarmId = config.streamSwarmIdBuilder({
        swarmId,
        runtimeId: stream.key,
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

    const registeredStream: StreamWithSegments = {
      runtimeId: stream.key,
      type: stream.type,
      properties,
      swarmId,
      identityHash,
      streamSwarmId,
      infoHash: computeInfoHash(streamSwarmId),
      segments: new Map<string, SegmentWithStream>(),
    };

    this.streams.set(stream.key, registeredStream);

    this.eventTarget.dispatchEvent("onStreamAdded", {
      stream: this.toStreamSnapshot(registeredStream),
    });
    return registeredStream;
  }

  /**
   * Loads a segment the player requested, from a peer, from the segment
   * store, or over HTTP. Initializes segment storage if it has not been
   * initialized yet.
   *
   * @param url - The URL the player is requesting.
   * @param options.byteRange - Its byte range, when the segment is a range of a file.
   * @param options.signal - Aborts the request. Environments without
   * `AbortController` may call `abortSegmentLoading` instead.
   * @returns The segment bytes and the bandwidth they were fetched at.
   * @throws {CoreRequestError} `"aborted"` when cancelled, `"failed"` when
   * every source failed.
   * @throws {Error} If the segment is not in the registry; check
   * `isSegmentLoadable` first.
   */
  async loadSegment(
    url: string,
    options: { byteRange?: ByteRange; signal?: AbortSignal } = {},
  ): Promise<SegmentResponse> {
    const key = segmentKey(url, options.byteRange);
    const { signal } = options;
    if (signal?.aborted) throw new CoreRequestError("aborted");

    await this.initializeSegmentStorage();
    if (signal?.aborted) throw new CoreRequestError("aborted");

    const segment = this.identifySegment(key);
    const loader = this.getStreamHybridLoader(segment);

    return new Promise<SegmentResponse>((resolve, reject) => {
      const callbacks: EngineCallbacks = {
        onSuccess: (response) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(response);
        },
        onError: (error) => {
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      };
      const onAbort = () => loader.abortSegmentRequest(key);
      signal?.addEventListener("abort", onAbort);
      void loader.loadSegment(segment, callbacks);
    });
  }

  /**
   * Aborts a pending `loadSegment` request. The request's promise rejects
   * with a `CoreRequestError` of type `"aborted"`.
   *
   * @param url - The URL the request was made with.
   * @param byteRange - The byte range the request was made with, if any.
   */
  abortSegmentLoading(url: string, byteRange?: ByteRange): void {
    const key = segmentKey(url, byteRange);
    this.mainStreamLoader?.abortSegmentRequest(key);
    this.secondaryStreamLoader?.abortSegmentRequest(key);
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
   * Whether the core will serve a request for this segment: it is in the
   * registry and P2P is enabled for its stream type. This is the check an
   * adapter makes before routing a request through `loadSegment`; a `false`
   * means "use the player's own loader".
   *
   * A request for a URL the registry does not know is reported through the
   * `onSegmentRegistryMiss` event, so a disagreement between the core's parse
   * and the player's is observable. Initialization segments are recognised
   * and passed through without a report; they are never shared.
   *
   * @param url - The URL the player is about to request.
   * @param byteRange - Its byte range, when the segment is a range of a file.
   */
  isSegmentLoadable(url: string, byteRange?: ByteRange): boolean {
    const key = segmentKey(url, byteRange);
    const segment = StreamUtils.getSegmentFromStreamsMap(this.streams, key);
    if (!segment) {
      if (!this.initSegmentKeys.has(key)) {
        this.eventTarget.dispatchEvent("onSegmentRegistryMiss", {
          url,
          byteRange,
        });
      }
      return false;
    }

    const config =
      segment.stream.type === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;
    return !config.isP2PDisabled;
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
    this.manifestRegistry = new ManifestRegistry();
    this.streams.clear();
    this.failedStreamKeys.clear();
    this.initSegmentKeys.clear();
    this.mainStreamLoader?.destroy();
    this.secondaryStreamLoader?.destroy();
    this.segmentStorage?.setSegmentChangeCallback(undefined);
    this.segmentStorage?.destroy();
    this.mainStreamLoader = undefined;
    this.secondaryStreamLoader = undefined;
    this.segmentStorage = undefined;
    this.manifestResponseUrl = undefined;
    this.streamDetails = { isLive: false };
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

  private identifySegment(key: string): SegmentWithStream {
    const segment = StreamUtils.getSegmentFromStreamsMap(this.streams, key);
    if (!segment) {
      throw new Error(`Segment is not in the registry: ${key}`);
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

function stripQuery(url: string): string {
  return url.split("?")[0];
}
