import { HybridLoader } from "./hybrid-loader";
import {
  Stream,
  CoreConfig,
  Segment,
  CoreEventMap,
  DynamicCoreConfig,
  EngineCallbacks,
  StreamWithSegments,
  SegmentWithStream,
  CommonCoreConfig,
  StreamConfig,
  DefinedCoreConfig,
} from "./types";
import { BandwidthCalculators, StreamDetails } from "./internal-types";
import * as StreamUtils from "./utils/stream";
import { BandwidthCalculator } from "./bandwidth-calculator";
import { SegmentsMemoryStorage } from "./segments-storage";
import { EventTarget } from "./utils/event-target";
import {
  overrideConfig,
  mergeAndFilterConfig,
  deepCopy,
  filterUndefinedProps,
} from "./utils/utils";
import { TRACKER_CLIENT_VERSION_PREFIX } from "./utils/peer";

export class Core<TStream extends Stream = Stream> {
  static readonly DEFAULT_COMMON_CORE_CONFIG: CommonCoreConfig = {
    cachedSegmentExpiration: undefined,
    cachedSegmentsCount: 0,
  };

  static readonly DEFAULT_STREAM_CONFIG: StreamConfig = {
    isP2PDisabled: false,
    simultaneousHttpDownloads: 3,
    simultaneousP2PDownloads: 3,
    highDemandTimeWindow: 15,
    httpDownloadTimeWindow: 3000,
    p2pDownloadTimeWindow: 6000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 1000,
    p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000,
    httpNotReceivingBytesTimeoutMs: 1000,
    httpErrorRetries: 3,
    p2pErrorRetries: 3,
    trackerClientVersionPrefix: TRACKER_CLIENT_VERSION_PREFIX,
    announceTrackers: [
      "wss://tracker.webtorrent.dev",
      "wss://tracker.files.fm:7073/announce",
      "wss://tracker.openwebtorrent.com",
      // "wss://tracker.novage.com.ua",
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
  private segmentStorage?: SegmentsMemoryStorage;
  private mainStreamLoader?: HybridLoader;
  private secondaryStreamLoader?: HybridLoader;
  private streamDetails: StreamDetails = {
    isLive: false,
    activeLevelBitrate: 0,
  };

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
      specificStreamConfig: filteredConfig?.mainStream,
    });

    this.secondaryStreamConfig = mergeAndFilterConfig<StreamConfig>({
      defaultConfig: Core.DEFAULT_STREAM_CONFIG,
      baseConfig: filteredConfig,
      specificStreamConfig: filteredConfig?.secondaryStream,
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
   *   httpDownloadTimeWindowMs: 60,  // Set HTTP download time window to 60 seconds
   *   p2pDownloadTimeWindowMs: 60,   // Set P2P download time window to 60 seconds
   *   httpNotReceivingBytesTimeoutMs: 1500,  // Set HTTP timeout to 1500 milliseconds
   *   p2pNotReceivingBytesTimeoutMs: 1500    // Set P2P timeout to 1500 milliseconds
   * };
   * core.applyDynamicConfig(dynamicConfig);
   */
  applyDynamicConfig(dynamicConfig: DynamicCoreConfig) {
    const { isP2PDisabled, mainStream, secondaryStream } = dynamicConfig;

    const hasP2PDisabledChanged = (
      current: boolean | undefined,
      updated: boolean | undefined,
    ) => updated !== undefined && current !== updated;

    const isP2PDisabledChanged =
      isP2PDisabled !== undefined &&
      (this.mainStreamConfig.isP2PDisabled !== isP2PDisabled ||
        this.secondaryStreamConfig.isP2PDisabled !== isP2PDisabled);

    const isMainStreamP2PDisabledChanged = hasP2PDisabledChanged(
      this.mainStreamConfig.isP2PDisabled,
      mainStream?.isP2PDisabled,
    );

    const isSecondaryStreamP2PDisabledChanged = hasP2PDisabledChanged(
      this.secondaryStreamConfig.isP2PDisabled,
      secondaryStream?.isP2PDisabled,
    );

    overrideConfig(this.commonCoreConfig, dynamicConfig);
    overrideConfig(this.mainStreamConfig, dynamicConfig);
    overrideConfig(this.secondaryStreamConfig, dynamicConfig);

    if (mainStream) {
      overrideConfig(this.mainStreamConfig, mainStream);
    }

    if (secondaryStream) {
      overrideConfig(this.secondaryStreamConfig, secondaryStream);
    }

    if (
      isP2PDisabledChanged &&
      this.mainStreamConfig.isP2PDisabled &&
      this.secondaryStreamConfig.isP2PDisabled
    ) {
      this.mainStreamLoader?.destroy();
      this.secondaryStreamLoader?.destroy();
      this.mainStreamLoader = undefined;
      this.secondaryStreamLoader = undefined;
      return;
    }

    if (isMainStreamP2PDisabledChanged && this.mainStreamConfig.isP2PDisabled) {
      this.mainStreamLoader?.destroy();
      this.mainStreamLoader = undefined;
    }

    if (
      isSecondaryStreamP2PDisabledChanged &&
      this.secondaryStreamConfig.isP2PDisabled
    ) {
      this.secondaryStreamLoader?.destroy();
      this.secondaryStreamLoader = undefined;
    }
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
   * Checks if a segment is already stored within the core.
   *
   * @param segmentLocalId - The local identifier of the segment to check.
   * @returns `true` if the segment is present, otherwise `false`.
   */
  hasSegment(segmentLocalId: string): boolean {
    return !!StreamUtils.getSegmentFromStreamsMap(this.streams, segmentLocalId);
  }

  /**
   * Retrieves a specific stream by its local identifier, if it exists.
   *
   * @param streamLocalId - The local identifier of the stream to retrieve.
   * @returns The stream with its segments, or `undefined` if not found.
   */
  getStream(streamLocalId: string): StreamWithSegments<TStream> | undefined {
    return this.streams.get(streamLocalId);
  }

  /**
   * Ensures a stream exists in the map; adds it if it does not.
   *
   * @param stream - The stream to potentially add to the map.
   */
  addStreamIfNoneExists(stream: TStream): void {
    if (this.streams.has(stream.localId)) return;

    this.streams.set(stream.localId, {
      ...stream,
      segments: new Map<string, SegmentWithStream<TStream>>(),
    });
  }

  /**
   * Updates the segments associated with a specific stream.
   *
   * @param streamLocalId - The local identifier of the stream to update.
   * @param addSegments - Optional segments to add to the stream.
   * @param removeSegmentIds - Optional segment IDs to remove from the stream.
   */
  updateStream(
    streamLocalId: string,
    addSegments?: Iterable<Segment>,
    removeSegmentIds?: Iterable<string>,
  ): void {
    const stream = this.streams.get(streamLocalId);
    if (!stream) return;

    if (addSegments) {
      for (const segment of addSegments) {
        if (stream.segments.has(segment.localId)) continue; // should not happen
        stream.segments.set(segment.localId, { ...segment, stream });
      }
    }

    if (removeSegmentIds) {
      for (const id of removeSegmentIds) {
        stream.segments.delete(id);
      }
    }

    this.mainStreamLoader?.updateStream(stream);
    this.secondaryStreamLoader?.updateStream(stream);
  }

  /**
   * Loads a segment given its local identifier and invokes the provided callbacks during the process.
   * Initializes segment storage if it has not been initialized yet.
   *
   * @param segmentLocalId - The local identifier of the segment to load.
   * @param callbacks - The callbacks to be invoked during segment loading.
   * @throws {Error} - Throws if the manifest response URL is not defined.
   */
  async loadSegment(segmentLocalId: string, callbacks: EngineCallbacks) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

    if (!this.segmentStorage) {
      this.segmentStorage = new SegmentsMemoryStorage(
        this.manifestResponseUrl,
        this.commonCoreConfig,
      );
      await this.segmentStorage.initialize();
    }

    const segment = this.identifySegment(segmentLocalId);

    const loader = this.getStreamHybridLoader(segment);
    void loader.loadSegment(segment, callbacks);
  }

  /**
   * Aborts the loading of a segment specified by its local identifier.
   *
   * @param segmentLocalId - The local identifier of the segment whose loading is to be aborted.
   */
  abortSegmentLoading(segmentLocalId: string): void {
    this.mainStreamLoader?.abortSegmentRequest(segmentLocalId);
    this.secondaryStreamLoader?.abortSegmentRequest(segmentLocalId);
  }

  /**
   * Updates the playback parameters, specifically position and playback rate, for stream loaders.
   *
   * @param position - The new position in the stream, in seconds.
   * @param rate - The new playback rate.
   */
  updatePlayback(position: number, rate: number): void {
    this.mainStreamLoader?.updatePlayback(position, rate);
    this.secondaryStreamLoader?.updatePlayback(position, rate);
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
   * Updates the 'isLive' status of the stream.
   *
   * @param isLive - Boolean indicating whether the stream is live.
   */
  setIsLive(isLive: boolean) {
    this.streamDetails.isLive = isLive;
  }

  isSegmentLoadableByP2P(segmentLocalId: string): boolean {
    try {
      const segment = this.identifySegment(segmentLocalId);

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
    } catch (e) {
      return false;
    }
  }

  /**
   * Cleans up resources used by the Core instance, including destroying any active stream loaders
   * and clearing stored segments.
   */
  destroy(): void {
    this.streams.clear();
    this.mainStreamLoader?.destroy();
    this.secondaryStreamLoader?.destroy();
    void this.segmentStorage?.destroy();
    this.mainStreamLoader = undefined;
    this.secondaryStreamLoader = undefined;
    this.segmentStorage = undefined;
    this.manifestResponseUrl = undefined;
    this.streamDetails = { isLive: false, activeLevelBitrate: 0 };
  }

  private identifySegment(segmentId: string): SegmentWithStream {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

    const segment = StreamUtils.getSegmentFromStreamsMap(
      this.streams,
      segmentId,
    );
    if (!segment) {
      throw new Error(`Not found segment with id: ${segmentId}`);
    }

    return segment;
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
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

    if (!this.segmentStorage?.isInitialized) {
      throw new Error("Segment storage is not initialized");
    }

    const streamConfig =
      segment.stream.type === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;

    return new HybridLoader(
      this.manifestResponseUrl,
      segment,
      this.streamDetails,
      streamConfig,
      this.bandwidthCalculators,
      this.segmentStorage,
      this.eventTarget,
    );
  }
}
