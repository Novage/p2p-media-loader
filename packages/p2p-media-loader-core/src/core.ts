import { HybridLoader } from "./hybrid-loader";
import {
  Stream,
  CoreConfig,
  Segment as SegmentBase,
  CoreEventMap,
  DynamicCoreConfig,
  EngineCallbacks,
} from "./types";
import {
  BandwidthCalculators,
  Segment,
  StreamDetails,
  StreamWithSegments,
} from "./internal-types";
import * as StreamUtils from "./utils/stream";
import { BandwidthCalculator } from "./bandwidth-calculator";
import { SegmentsMemoryStorage } from "./segments-storage";
import { EventTarget } from "./utils/event-target";
import { deepConfigMerge } from "./utils/utils";

export class Core<TStream extends Stream = Stream> {
  private readonly eventTarget = new EventTarget<CoreEventMap>();
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private config: CoreConfig = {
    simultaneousHttpDownloads: 3,
    simultaneousP2PDownloads: 3,
    highDemandTimeWindow: 15,
    httpDownloadTimeWindow: 45,
    p2pDownloadTimeWindow: 45,
    cachedSegmentExpiration: 120 * 1000,
    cachedSegmentsCount: 50,
    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pNotReceivingBytesTimeoutMs: 1000,
    p2pLoaderDestroyTimeoutMs: 30 * 1000,
    httpNotReceivingBytesTimeoutMs: 1000,
    httpErrorRetries: 3,
    p2pErrorRetries: 3,
  };
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

  constructor(config?: CoreConfig) {
    this.applyConfig(config);
  }

  private applyConfig(config?: CoreConfig) {
    if (!config) return;
    this.config = deepConfigMerge(this.config, config);
  }

  getConfig() {
    return deepConfigMerge({}, this.config);
  }

  applyDynamicConfig(dynamicConfig: DynamicCoreConfig) {
    this.config = deepConfigMerge(this.config, dynamicConfig);
  }

  addEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.eventTarget.addEventListener(eventName, listener);
  }

  removeEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.eventTarget.removeEventListener(eventName, listener);
  }

  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = url.split("?")[0];
  }

  hasSegment(segmentLocalId: string): boolean {
    return !!StreamUtils.getSegmentFromStreamsMap(this.streams, segmentLocalId);
  }

  getStream(streamLocalId: string): StreamWithSegments<TStream> | undefined {
    return this.streams.get(streamLocalId);
  }

  addStreamIfNoneExists(stream: TStream): void {
    if (this.streams.has(stream.localId)) return;

    this.streams.set(stream.localId, {
      ...stream,
      segments: new Map<string, Segment>(),
    });
  }

  updateStream(
    streamLocalId: string,
    addSegments?: Iterable<SegmentBase>,
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

  async loadSegment(segmentLocalId: string, callbacks: EngineCallbacks) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

    if (!this.segmentStorage) {
      this.segmentStorage = new SegmentsMemoryStorage(
        this.manifestResponseUrl,
        this.config,
      );
      await this.segmentStorage.initialize();
    }

    const segment = this.identifySegment(segmentLocalId);
    const loader = this.getStreamHybridLoader(segment);
    void loader.loadSegment(segment, callbacks);
  }

  abortSegmentLoading(segmentLocalId: string): void {
    this.mainStreamLoader?.abortSegmentRequest(segmentLocalId);
    this.secondaryStreamLoader?.abortSegmentRequest(segmentLocalId);
  }

  updatePlayback(position: number, rate: number): void {
    this.mainStreamLoader?.updatePlayback(position, rate);
    this.secondaryStreamLoader?.updatePlayback(position, rate);
  }

  setActiveLevelBitrate(bitrate: number) {
    if (bitrate !== this.streamDetails.activeLevelBitrate) {
      this.streamDetails.activeLevelBitrate = bitrate;
      this.mainStreamLoader?.notifyLevelChanged();
      this.secondaryStreamLoader?.notifyLevelChanged();
    }
  }

  setIsLive(isLive: boolean) {
    this.streamDetails.isLive = isLive;
  }

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

  private identifySegment(segmentId: string): Segment {
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

  private getStreamHybridLoader(segment: Segment) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

    const createNewHybridLoader = (manifestResponseUrl: string) => {
      if (!this.segmentStorage?.isInitialized) {
        throw new Error("Segment storage is not initialized");
      }
      return new HybridLoader(
        manifestResponseUrl,
        segment,
        this.streamDetails,
        this.config,
        this.bandwidthCalculators,
        this.segmentStorage,
        this.eventTarget,
      );
    };

    if (segment.stream.type === "main") {
      this.mainStreamLoader ??= createNewHybridLoader(this.manifestResponseUrl);
      return this.mainStreamLoader;
    } else {
      this.secondaryStreamLoader ??= createNewHybridLoader(
        this.manifestResponseUrl,
      );
      return this.secondaryStreamLoader;
    }
  }
}
