import { HybridLoader } from "./hybrid-loader.js";
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
  StreamType,
  DynamicStreamConfig,
} from "./types.js";
import { BandwidthCalculators, StreamDetails } from "./internal-types.js";
import * as StreamUtils from "./utils/stream.js";
import { BandwidthCalculator } from "./bandwidth-calculator.js";
import { SegmentMemoryStorage } from "./segment-storage/segment-memory-storage.js";
import { EventTarget } from "./utils/event-target.js";
import {
  overrideConfig,
  mergeAndFilterConfig,
  deepCopy,
  filterUndefinedProps,
} from "./utils/utils.js";
import { TRACKER_CLIENT_VERSION_PREFIX } from "./utils/peer.js";
import { SegmentStorage } from "./segment-storage/index.js";
import { P2PTrackerClient } from "./p2p/tracker-client.js";

/** Core class for managing media streams loading via P2P. */
export class Core<TStream extends Stream = Stream> {
  /** Default configuration for common core settings. */
  static readonly DEFAULT_COMMON_CORE_CONFIG: CommonCoreConfig = {
    segmentMemoryStorageLimit: undefined,
    customSegmentStorageFactory: undefined,
  };

  /** Default configuration for stream settings. */
  static readonly DEFAULT_STREAM_CONFIG: StreamConfig = {
    isP2PUploadDisabled: false,
    isP2PDisabled: false,
    simultaneousHttpDownloads: 2,
    simultaneousP2PDownloads: 3,
    highDemandTimeWindow: 15,
    httpDownloadTimeWindow: 3000,
    p2pDownloadTimeWindow: 6000,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 2000,
    p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000,
    httpNotReceivingBytesTimeoutMs: 3000,
    httpErrorRetries: 3,
    p2pErrorRetries: 3,
    trackerClientVersionPrefix: TRACKER_CLIENT_VERSION_PREFIX,
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
      specificStreamConfig: filteredConfig.mainStream,
    });

    this.secondaryStreamConfig = mergeAndFilterConfig<StreamConfig>({
      defaultConfig: Core.DEFAULT_STREAM_CONFIG,
      baseConfig: filteredConfig,
      specificStreamConfig: filteredConfig.secondaryStream,
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
   * @returns The stream with its segments, or `undefined` if not found.
   */
  getStream(streamRuntimeId: string): StreamWithSegments<TStream> | undefined {
    return this.streams.get(streamRuntimeId);
  }

  /**
   * Ensures a stream exists in the map; adds it if it does not.
   *
   * @param stream - The stream to potentially add to the map.
   */
  addStreamIfNoneExists(stream: TStream): void {
    if (this.streams.has(stream.runtimeId)) return;

    this.streams.set(stream.runtimeId, {
      ...stream,
      segments: new Map<string, SegmentWithStream<TStream>>(),
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
  }

  /**
   * Loads a segment given its runtime identifier and invokes the provided callbacks during the process.
   * Initializes segment storage if it has not been initialized yet.
   *
   * @param segmentRuntimeId - The runtime identifier of the segment to load.
   * @param callbacks - The callbacks to be invoked during segment loading.
   * @throws {Error} - Throws if the manifest response URL is not defined.
   */
  async loadSegment(segmentRuntimeId: string, callbacks: EngineCallbacks) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

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
   * Updates the playback parameters while play head moves, specifically position and playback rate, for stream loaders.
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
   */
  destroy(): void {
    this.streams.clear();
    this.mainStreamLoader?.destroy();
    this.secondaryStreamLoader?.destroy();
    this.segmentStorage?.destroy();
    this.mainStreamLoader = undefined;
    this.secondaryStreamLoader = undefined;
    this.segmentStorage = undefined;
    this.manifestResponseUrl = undefined;
    this.streamDetails = { isLive: false, activeLevelBitrate: 0 };
    P2PTrackerClient.clearPeerIdCache();
  }

  private async initializeSegmentStorage() {
    if (this.segmentStorage) return;

    const { isLive } = this.streamDetails;
    const createCustomStorage =
      this.commonCoreConfig.customSegmentStorageFactory;

    if (createCustomStorage && typeof createCustomStorage !== "function") {
      throw new Error("Storage configuration is invalid");
    }

    const segmentStorage = createCustomStorage
      ? createCustomStorage(isLive)
      : new SegmentMemoryStorage();

    await segmentStorage.initialize(
      this.commonCoreConfig,
      this.mainStreamConfig,
      this.secondaryStreamConfig,
    );

    this.segmentStorage = segmentStorage;
  }

  private identifySegment(segmentRuntimeId: string): SegmentWithStream {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

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
    overrideConfig(this.commonCoreConfig, dynamicConfig);
    overrideConfig(this.mainStreamConfig, dynamicConfig);
    overrideConfig(this.secondaryStreamConfig, dynamicConfig);

    if (mainStream) {
      overrideConfig(this.mainStreamConfig, mainStream);
    }

    if (secondaryStream) {
      overrideConfig(this.secondaryStreamConfig, secondaryStream);
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
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

    if (!this.segmentStorage) {
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
