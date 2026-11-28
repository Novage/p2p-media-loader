import { isWebRtcAvailable } from "./webtorrent/webtorrent-client/webrtc-utils.js";
import { diagnostics, type DiagnosticsToken } from "./diagnostics.js";
import { HybridLoader } from "./hybrid-loader.js";
import { runAll } from "./run-all.js";
import type { PlaybackState } from "./playback.js";
import type { ManifestProtocol } from "./manifest/types.js";
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
  StreamType,
  DynamicStreamConfig,
  ProcessedManifest,
} from "./types.js";
import {
  BandwidthCalculators,
  EngineCallbacks,
  StreamWithSegments,
  SegmentWithStream,
} from "./internal-types.js";
import { Presentation } from "./presentation.js";
import { BandwidthCalculator } from "./bandwidth-calculator.js";
import { SegmentMemoryStorage } from "./segment-storage/segment-memory-storage.js";
import { EventTarget } from "./utils/event-target.js";
import { overrideConfig, deepCopy } from "./utils/utils.js";
import { generatePeerId } from "./utils/peer.js";
import {
  DEFAULT_COMMON_CORE_CONFIG,
  DEFAULT_STREAM_CONFIG,
  mergeCoreConfig,
  reportObsoleteConfigKeys,
  stripStaticOnlyProps,
} from "./core-config.js";
import { SegmentStorage } from "./segment-storage/index.js";
import { WebTorrentSocketPool } from "./webtorrent/webtorrent-socket-pool/index.js";

/** Core class for managing media streams loading via P2P. */
export class Core {
  /**
   * @internal The diagnostics ledger, for the player adapters; see
   * specs/diagnostics.md. Reached through `Core`, which every adapter imports
   * already, rather than through an import of its own: an adapter can meet a
   * core of another version, and a core without the ledger must cost the
   * adapter its records, never its load. Typed as possibly absent for that
   * reason.
   */
  static readonly diagnostics: typeof diagnostics | undefined = diagnostics;

  /** Default configuration for common core settings. */
  static readonly DEFAULT_COMMON_CORE_CONFIG: CommonCoreConfig =
    DEFAULT_COMMON_CORE_CONFIG;

  /** Default configuration for stream settings. */
  static readonly DEFAULT_STREAM_CONFIG: StreamConfig = DEFAULT_STREAM_CONFIG;

  private readonly eventTarget = new EventTarget<CoreEventMap>();
  /** The source playing: its manifests, registry, streams and their names. */
  private readonly presentation: Presentation;
  // The presentation's state, under the names `Core` had for it before it
  // moved there. `streamDetails` is read here too: the segment storage and
  // every stream loader take it. Tests of `Core` read all three.
  private get streams() {
    return this.presentation.streams;
  }
  private get streamDetails() {
    return this.presentation.streamDetails;
  }
  private get clockedManifest() {
    return this.presentation.clockedManifest;
  }
  // One object each for the core's life: a dynamic config update changes
  // them in place, and the presentation holds them by reference.
  private readonly mainStreamConfig: StreamConfig;
  private readonly secondaryStreamConfig: StreamConfig;
  private commonCoreConfig: CommonCoreConfig;
  /**
   * The player's last report on the current source, and when it came: a
   * stream loader created after it starts from it rather than from nothing.
   */
  private lastPlayback?: { state: PlaybackState; at: number };
  private readonly bandwidthCalculators: BandwidthCalculators = {
    all: new BandwidthCalculator(),
    http: new BandwidthCalculator(),
  };
  private segmentStorage?: SegmentStorage;
  private storageDiagnosticsToken?: DiagnosticsToken;
  /**
   * The core's work on one source, from its first manifest to `destroy()`.
   * The core outlives it: `destroy()` readies it for the next source.
   */
  private sourceDiagnosticsToken?: DiagnosticsToken;
  /** Tells the bandwidth probes of two cores on one page apart. */
  private static bandwidthProbeSequence = 0;
  private unprobeBandwidth?: () => void;
  private readonly webTorrentSocketPool = new WebTorrentSocketPool();
  /** Whether the missing WebRTC has been logged and counted already. */
  private webRtcMissingReported = false;
  /** The renamed or removed config keys this core has reported, each once. */
  private readonly reportedObsoleteKeys = new Set<string>();
  private readonly logger = debug("p2pml-core:core");
  private readonly socketPoolLogger = debug(
    "p2pml-core:webtorrent-socket-pool",
  );
  private readonly peerId: string;
  private mainStreamLoader?: HybridLoader;
  private secondaryStreamLoader?: HybridLoader;
  private storageInitPromise?: Promise<void>;
  /** Bumped by every initialization and every `destroy()`; see below. */
  private storageGeneration = 0;
  /**
   * Requests that have entered `loadSegment` but have no stream loader yet,
   * because the segment storage is still being initialized. There is nothing
   * for `abortSegmentLoading` to cancel in that window, so it marks them here
   * instead. See specs/player-adapters.md.
   */
  private readonly startingRequests = new Set<{
    key: string;
    aborted: boolean;
  }>();
  private readonly registryMissLogger = debug("p2pml-core:registry-miss");
  /**
   * Constructs a new Core instance with optional initial configuration.
   *
   * @param config - Optional partial configuration to override default settings.
   *
   * @example
   * // Create a Core instance with custom configuration for HTTP and P2P downloads.
   * import { Core } from "p2p-media-loader-core";
   *
   * const core = new Core({
   *   simultaneousHttpDownloads: 5,
   *   simultaneousP2PDownloads: 5,
   *   httpErrorRetries: 5,
   *   p2pErrorRetries: 5
   * });
   *
   * @example
   * // Create a Core instance using the default configuration.
   * import { Core } from "p2p-media-loader-core";
   *
   * const core = new Core();
   */
  constructor(config?: Partial<CoreConfig>) {
    reportObsoleteConfigKeys(config, this.reportedObsoleteKeys);
    const merged = mergeCoreConfig(config);
    this.commonCoreConfig = merged.common;
    this.mainStreamConfig = merged.main;
    this.secondaryStreamConfig = merged.secondary;
    this.presentation = new Presentation(
      config?.manifestParsers ?? [],
      { main: this.mainStreamConfig, secondary: this.secondaryStreamConfig },
      {
        onStreamAdded: (params) =>
          this.eventTarget.dispatchEvent("onStreamAdded", params),
        onStreamRegistrationError: (params) =>
          this.eventTarget.dispatchEvent("onStreamRegistrationError", params),
        onSegmentsChanged: (stream) => {
          this.mainStreamLoader?.updateStream(stream);
          this.secondaryStreamLoader?.updateStream(stream);
        },
        onSegmentsLeft: (stream, segmentIds) =>
          this.releaseFromStorage(stream, segmentIds),
      },
    );

    this.peerId = generatePeerId(
      this.commonCoreConfig.trackerClientVersionPrefix,
    );

    this.webTorrentSocketPool.addEventListener("error", (error, url) => {
      this.socketPoolLogger(`WebSocket error for tracker url ${url}:`, error);
    });
  }

  /**
   * Retrieves the current configuration for the core instance.
   *
   * @returns A deep copy of the core configuration. Changing it changes
   * nothing in the core; `applyDynamicConfig` is how to do that.
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
   * Three common settings are accepted here but do not change the running
   * core. `customSegmentStorageFactory` is called, and the built-in memory
   * storage reads `segmentMemoryStorageLimit`, when the segment storage is
   * created — on the first segment request after construction or after
   * `destroy()` — so a change applies from the next storage, not to the one
   * in use. `trackerClientVersionPrefix` is read once, at construction, and a
   * change to it has no effect.
   *
   * @param dynamicConfig - A set of configuration changes to apply.
   *
   * @example
   * // Assuming `core` is an instance of Core
   *
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
    reportObsoleteConfigKeys(dynamicConfig, this.reportedObsoleteKeys);
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
   * Names the swarm explicitly, in place of the first manifest's URL.
   *
   * By default the swarm ID is the URL of the first manifest handed to
   * `processManifest` that registers a stream — its `requestedUrl` where the
   * caller passes one, its `url` otherwise — with its entire query string
   * discarded. An integration that knows a better name — one shared by every
   * viewer regardless of CDN or redirect — may set it here before the first
   * manifest arrives, or configure `swarmId` instead. See
   * specs/segment-identity.md.
   *
   * @param url - The URL to name the swarm by; its query string is discarded.
   */
  setManifestResponseUrl(url: string): void {
    this.presentation.nameBy(url);
  }

  /**
   * Parses a manifest the player has fetched and brings the registry up to
   * date: streams are registered with their identity, their segments are
   * added and removed by URL key, and the live state is derived. This is how
   * streams enter the core; segments also come from `processSegmentIndex`,
   * and from the core parsing a clock-based manifest again as time passes.
   * See specs/manifest-registry.md.
   *
   * A manifest with no matching parser is ignored, and a parse failure leaves
   * the registry as it was — a transient bad response must not empty a
   * working segment list. A failure inside `parse` is caught; one thrown by a
   * parser's `canParse`, consulted when no `protocol` is given, propagates.
   * Idempotent: re-processing an unchanged manifest changes nothing and emits
   * no events.
   *
   * @returns What the manifest described — each stream it listed segments
   * for, with the bounds of those segments on the manifest timeline — so an
   * adapter can size its player's live window from the same parse; or
   * `undefined` when the manifest was ignored or failed to parse.
   */
  processManifest(manifest: {
    /** Where the response came from, which is what its URIs resolve against. */
    url: string;
    /**
     * What the player asked for, where a redirect made it differ from `url`.
     * A master names the URL of each of its media playlists, so that is the
     * one the core knows a stream by, and the one every viewer of the stream
     * agrees on when nothing else names the swarm.
     */
    requestedUrl?: string;
    /** Text, or the raw bytes a player's networking layer delivers. */
    data: string | ArrayBuffer | ArrayBufferView;
    protocol?: ManifestProtocol;
  }): ProcessedManifest | undefined {
    if (!this.sourceDiagnosticsToken) {
      this.sourceDiagnosticsToken = diagnostics?.open("CoreSource");
      if (this.sourceDiagnosticsToken) this.probeBandwidth();
    }
    return this.presentation.processManifest(manifest);
  }

  /**
   * Resolves a stream's external segment index — the `sidx` box of a DASH
   * `SegmentBase` representation — from the bytes the player fetched for it.
   * The stream, registered from the MPD without segments, gains them here.
   * See specs/manifest-registry.md, "Resolving an external index".
   *
   * Data with no parsable `sidx` box, or for which no stream is waiting,
   * changes nothing. A throw from a parser's `parseSegmentIndex` is caught,
   * logged and counted, and also changes nothing: the index loads without
   * P2P. The index is read by the first parser that has `parseSegmentIndex`.
   *
   * @param index.url - The media file the index was read from.
   * @param index.byteRange - The range that was fetched, if the request had one.
   * @param index.data - The response body, which may be wider than the index.
   * @returns How the presentation stands once the index is read — every
   * stream of it, not only the one the index resolved, since a presentation
   * whose streams each carry their own index would otherwise be described one
   * stream at a time. `undefined` when no stream awaited an index here.
   */
  processSegmentIndex(index: {
    url: string;
    byteRange?: ByteRange;
    data: ArrayBuffer | ArrayBufferView;
  }): ProcessedManifest | undefined {
    return this.presentation.processSegmentIndex(index);
  }

  /**
   * Whether a request is for a registered stream's external segment index —
   * the `sidx` range of a DASH `SegmentBase` representation. Such a request
   * is not a media segment: the adapter lets the player load it and hands the
   * response to `processSegmentIndex`.
   *
   * @param url - The URL the player is about to request.
   * @param byteRange - Its byte range, if any; a range covering the index counts.
   */
  isSegmentIndex(url: string, byteRange?: ByteRange): boolean {
    return this.presentation.isSegmentIndex(url, byteRange);
  }

  /**
   * Tells the segment storage which of a stream's segments its manifest no
   * longer lists, so that it can drop them; see
   * `SegmentStorage.onSegmentsRemoved`. The storage may be an integrator's
   * own and free to throw, and processing a manifest must not.
   */
  private releaseFromStorage(stream: StreamWithSegments, segmentIds: number[]) {
    const storage = this.segmentStorage;
    if (!storage?.onSegmentsRemoved) return;
    try {
      storage.onSegmentsRemoved(
        stream.swarmId,
        stream.streamSwarmId,
        segmentIds,
      );
    } catch (error) {
      this.logger("the segment storage refused segments that left: %O", error);
    }
  }

  /**
   * Whether a segment request resolves against the core's streams.
   *
   * @param url - The URL the player is about to request.
   * @param byteRange - Its byte range, when the segment is a range of a file.
   * @returns `true` if a stream of the core holds the segment, otherwise
   * `false`; a segment the core passes through, such as one a
   * `segmentFilter` keeps off P2P, is not held.
   */
  hasSegment(url: string, byteRange?: ByteRange): boolean {
    return this.presentation.hasSegment(url, byteRange);
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
    return this.presentation.getStream(streamRuntimeId);
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
    return this.presentation.getStreams();
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
   * @throws {CoreRequestError} `"aborted"` when cancelled. `"failed"` when the
   * request's one HTTP attempt failed at the origin, after a peer that has the
   * segment was tried where there was one; `httpStatus` is that response's
   * status, for the player to retry by as it would its own load. The core
   * makes no retry of its own for the request: a player, or an integration
   * on its behalf, retries. It is also `"failed"`, with no `cause` and no
   * `httpStatus`, when the segment storage throws, when the loader cannot
   * start, or, with HTTP off (`httpErrorRetries` 0), when a peer fails it.
   * @throws {Error} If the segment is not in the registry; check
   * `isSegmentLoadable` first.
   * @throws What initializing the segment storage threw — a
   * `customSegmentStorageFactory` that is not a function or that throws, or a
   * storage whose `initialize` rejects — unless the request was aborted
   * meanwhile. The next request tries the initialization again.
   */
  async loadSegment(
    url: string,
    options: { byteRange?: ByteRange; signal?: AbortSignal } = {},
  ): Promise<SegmentResponse> {
    const key = segmentKey(url, options.byteRange);
    const { signal } = options;
    if (signal?.aborted) throw new CoreRequestError("aborted");

    const starting = { key, aborted: false };
    this.startingRequests.add(starting);
    try {
      await this.initializeSegmentStorage();
    } catch (error) {
      // A storage torn down by the `destroy()` that aborted this request may
      // reject its initialization; the request was aborted, and says so.
      if (starting.aborted || signal?.aborted) {
        throw new CoreRequestError("aborted");
      }
      throw error;
    } finally {
      this.startingRequests.delete(starting);
    }
    if (starting.aborted || signal?.aborted) {
      throw new CoreRequestError("aborted");
    }

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
      // The loader reports its own failures through the callbacks; this is
      // the backstop for a throw it never saw, which would otherwise leave
      // this promise pending and the abort listener attached for ever.
      loader.loadSegment(segment, callbacks).catch((error: unknown) => {
        this.logger("loader failed to start %s: %O", key, error);
        callbacks.onError(new CoreRequestError("failed", String(error)));
      });
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
    // A request still waiting for the segment storage has no loader to carry
    // the abort; it is told here and gives up as soon as it has one.
    for (const starting of this.startingRequests) {
      if (starting.key === key) starting.aborted = true;
    }
    this.mainStreamLoader?.abortSegmentRequest(key);
    this.secondaryStreamLoader?.abortSegmentRequest(key);
  }

  /**
   * Reports the player's playback state to the stream loaders. Every
   * integration must call it whenever the state changes: the core judges
   * whether each request is urgent by the reported buffer, and takes a player
   * that has not reported as one with nothing buffered, so that every request
   * the storage cannot serve goes over HTTP at once.
   *
   * Only the buffer ahead of the playhead and the rate are needed — never the
   * absolute position. See `getPlaybackStateFromMediaElement` for the browser
   * case, and specs/playback-contract.md for why.
   *
   * @param state - The current playback state.
   */
  updatePlayback(state: PlaybackState): void {
    this.lastPlayback = { state, at: performance.now() };
    this.mainStreamLoader?.updatePlayback(state);
    this.secondaryStreamLoader?.updatePlayback(state);
  }

  /**
   * Whether the core will serve a request for this segment: it is in the
   * registry, P2P is enabled for its stream type, the page has WebRTC, and
   * its stream is shareable — not a stream no manifest identified that shares
   * its swarm with another of its type. This is the check an adapter makes
   * before routing a request through `loadSegment`; a `false` means "use the
   * player's own loader".
   *
   * A request for a URL the registry does not know is reported through the
   * `onSegmentRegistryMiss` event, so a disagreement between the core's parse
   * and the player's is observable. Initialization segments, external segment
   * indexes (see `isSegmentIndex`), the segments of subtitles and trick play,
   * DASH segments too short for an ID of their own (they start and end in one
   * 100 ms unit), and segments a `segmentFilter` keeps off P2P are recognised
   * and passed through without a report; they are never shared.
   *
   * @param url - The URL the player is about to request.
   * @param byteRange - Its byte range, when the segment is a range of a file.
   */
  isSegmentLoadable(url: string, byteRange?: ByteRange): boolean {
    const key = segmentKey(url, byteRange);
    const segment = this.presentation.findSegment(key);
    if (!segment) {
      // A key the registry recognises (isInitSegment, isPassThroughSegment)
      // or an external index passes through knowingly; only an unknown URL
      // is a miss.
      if (
        !this.presentation.isRecognised(key) &&
        !this.presentation.isSegmentIndex(url, byteRange)
      ) {
        // Logged as well as dispatched: a miss makes the segment load without
        // P2P and leaves no other trace, so without this a stream that stops
        // sharing looks the same as one with no peers.
        this.registryMissLogger("%s", key);
        diagnostics?.count("RegistryMiss");
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
    if (config.isP2PDisabled) return false;
    if (!this.hasWebRtc()) return false;

    return this.presentation.isShareable(segment.stream);
  }

  /**
   * Whether the page has WebRTC. Without it no peer can connect, so the core
   * serves nothing and the player loads every segment itself, as with P2P
   * disabled: no tracker socket opens and no announce repeats for nothing.
   * Said once per core.
   */
  private hasWebRtc(): boolean {
    if (isWebRtcAvailable) return true;
    if (!this.webRtcMissingReported) {
      this.webRtcMissingReported = true;
      this.logger("no WebRTC on this page: P2P is off, the player loads alone");
      diagnostics?.count("WebRtc:unavailable");
    }
    return false;
  }

  /**
   * Cleans up resources used by the Core instance, including destroying any active stream loaders
   * and clearing stored segments.
   *
   * The core is left ready for the next source: the manifest registry and
   * the registered streams are emptied, and the swarm name the last source
   * gave — by `setManifestResponseUrl` or by its first manifest — is
   * forgotten, so the next source names its own. A configured `swarmId`
   * string stays; a `swarmId` function names the next source again.
   * Every part is torn down even when one before it throws — an integrator's
   * own segment storage is free to — and the first failure is rethrown once
   * all have run.
   *
   * Event listeners deliberately survive: the player integrations reuse one
   * Core instance across media sources, destroying it between loads, and
   * subscriptions (e.g. `onStreamAdded`, `onPeerConnect`) are expected to
   * keep working after the next source loads. Use `removeEventListener` to
   * unsubscribe explicitly.
   */
  destroy(): void {
    // Nothing that was waiting for the old segment storage may go on to load
    // against the new one.
    for (const starting of this.startingRequests) starting.aborted = true;
    this.presentation.reset();
    // Each part is torn down whatever the ones before it made of themselves,
    // and this core is left empty either way. An integrator's own segment
    // storage is destroyed here and is free to throw; stopping at it would
    // leave destroyed loaders still referenced and the failed storage still
    // set, so the next stream to use this core would take both back and run
    // with P2P silently dead. The first failure is raised once there is
    // nothing left to reset.
    const failures = runAll([
      () => this.mainStreamLoader?.destroy(),
      () => this.secondaryStreamLoader?.destroy(),
      () => this.segmentStorage?.setSegmentChangeCallback(undefined),
      () => this.segmentStorage?.destroy(),
      () => this.webTorrentSocketPool.closeAllSockets(),
    ]);
    // Tearing the loaders down settled every download. One still measured as
    // loading is a stop some path missed: the calculator would count it as
    // loading for ever, and every estimate after it would run slow.
    const { all, http } = this.bandwidthCalculators;
    for (const [name, calculator] of [
      ["all", all],
      ["http", http],
    ] as const) {
      if (calculator.loadingCount > 0) {
        diagnostics?.anomaly(
          `BandwidthCalculator:${name} loading after destroy`,
        );
      }
    }

    this.mainStreamLoader = undefined;
    this.secondaryStreamLoader = undefined;
    this.lastPlayback = undefined;
    if (this.storageDiagnosticsToken) {
      diagnostics?.close(this.storageDiagnosticsToken, "destroyed");
      this.storageDiagnosticsToken = undefined;
    }
    if (this.sourceDiagnosticsToken) {
      diagnostics?.close(this.sourceDiagnosticsToken, "destroyed");
      this.sourceDiagnosticsToken = undefined;
    }
    this.unprobeBandwidth?.();
    this.unprobeBandwidth = undefined;
    this.segmentStorage = undefined;
    this.storageInitPromise = undefined;
    this.storageGeneration++;
    if (failures.length) throw failures[0];
  }

  /**
   * The downloads each shared bandwidth calculator measures as loading. They
   * are the downloads under way: summed over the page's cores, `all` equals
   * the open `Download:http` and `Download:p2p` records, and `http` the open
   * `Download:http` ones. A calculator ahead of them missed a stop, and its
   * loading-only clock runs for ever. Kept for one source, as `CoreSource` is,
   * so it never holds on to a core the page has let go.
   */
  private probeBandwidth() {
    const { all, http } = this.bandwidthCalculators;
    this.unprobeBandwidth = diagnostics?.probe(
      `BandwidthLoading#${++Core.bandwidthProbeSequence}`,
      () => ({ all: all.loadingCount, http: http.loadingCount }),
    );
  }

  private async initializeSegmentStorage() {
    if (this.segmentStorage) return;
    if (this.storageInitPromise) return this.storageInitPromise;

    // Known by its generation, not by there being an initialization: a
    // `destroy()` while this waits, or the next source's request re-arming
    // it with an initialization of its own, moves the generation on — and
    // this one must not mistake that for itself and install a storage made
    // for the previous source.
    const generation = ++this.storageGeneration;
    const init = this.createSegmentStorage(
      () => this.storageGeneration === generation,
    );
    this.storageInitPromise = init;

    try {
      await init;
    } finally {
      if (this.storageInitPromise === init) this.storageInitPromise = undefined;
    }
  }

  /**
   * Builds and initializes the segment storage, and installs it if this
   * initialization is still the current one when it is done.
   */
  private async createSegmentStorage(isCurrent: () => boolean) {
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

    if (!isCurrent()) {
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
    this.storageDiagnosticsToken = diagnostics?.open("SegmentStorage");
  }

  private identifySegment(key: string): SegmentWithStream {
    const segment = this.presentation.findSegment(key);
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
    // Stream identity is decided once, at stream registration, and the
    // segment filter is read once, when the registry is made; changing them
    // at runtime would silently desynchronize the announced swarms from the
    // registered streams.
    const sanitizedDynamicConfig = stripStaticOnlyProps(
      dynamicConfig,
      this.logger,
    );
    const sanitizedMainStream =
      mainStream && stripStaticOnlyProps(mainStream, this.logger);
    const sanitizedSecondaryStream =
      secondaryStream && stripStaticOnlyProps(secondaryStream, this.logger);

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

    const loader = new HybridLoader(
      segment,
      this.streamDetails,
      streamConfig,
      this.bandwidthCalculators,
      this.segmentStorage,
      this.webTorrentSocketPool,
      this.eventTarget,
      this.peerId,
    );
    if (this.lastPlayback) {
      loader.updatePlayback(this.lastPlayback.state, this.lastPlayback.at);
    }
    return loader;
  }
}
