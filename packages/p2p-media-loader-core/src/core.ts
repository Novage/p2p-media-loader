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
import { deepCopy } from "./utils/utils";
import { TRACKER_CLIENT_VERSION_PREFIX } from "./utils/peer";
import { DeepReadonly } from "ts-essentials";

export class Core<TStream extends Stream = Stream> {
  static readonly DEFAULT_CONFIG: DeepReadonly<CoreConfig> = {
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
  };

  private readonly eventTarget = new EventTarget<CoreEventMap>();
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private config: DeepReadonly<CoreConfig>;
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

  constructor(config?: DeepReadonly<Partial<CoreConfig>>) {
    this.config = deepCopy({ ...Core.DEFAULT_CONFIG, ...config });
  }

  getConfig(): DeepReadonly<CoreConfig> {
    return this.config;
  }

  applyDynamicConfig(dynamicConfig: DeepReadonly<DynamicCoreConfig>) {
    this.config = deepCopy({ ...this.config, ...dynamicConfig });
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
    if (segment.stream.type === "main") {
      this.mainStreamLoader ??= this.createNewHybridLoader(segment);
      return this.mainStreamLoader;
    } else {
      this.secondaryStreamLoader ??= this.createNewHybridLoader(segment);
      return this.secondaryStreamLoader;
    }
  }

  private createNewHybridLoader(segment: Segment) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is not defined");
    }

    if (!this.segmentStorage?.isInitialized) {
      throw new Error("Segment storage is not initialized");
    }

    return new HybridLoader(
      this.manifestResponseUrl,
      segment,
      this.streamDetails,
      this.config,
      this.bandwidthCalculators,
      this.segmentStorage,
      this.eventTarget,
    );
  }
}
