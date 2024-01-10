import { HybridLoader } from "./hybrid-loader";
import {
  Stream,
  StreamWithSegments,
  Segment,
  Settings,
  SegmentBase,
  CoreEventHandlers,
  BandwidthCalculators,
  StreamDetails,
} from "./types";
import * as StreamUtils from "./utils/stream";
import { BandwidthCalculator } from "./bandwidth-calculator";
import { EngineCallbacks } from "./requests/engine-request";
import { SegmentsMemoryStorage } from "./segments-storage";

export class Core<TStream extends Stream = Stream> {
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private readonly settings: Settings = {
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

  constructor(private readonly eventHandlers?: CoreEventHandlers) {}

  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = url.split("?")[0];
  }

  hasSegment(segmentLocalId: string): boolean {
    const segment = StreamUtils.getSegmentFromStreamsMap(
      this.streams,
      segmentLocalId
    );
    return !!segment;
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
    addSegments?: SegmentBase[],
    removeSegmentIds?: string[]
  ): void {
    const stream = this.streams.get(streamLocalId);
    if (!stream) return;

    addSegments?.forEach((s) => {
      const segment = { ...s, stream };
      stream.segments.set(segment.localId, segment);
    });
    removeSegmentIds?.forEach((id) => stream.segments.delete(id));
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
        this.settings
      );
      await this.segmentStorage.initialize();
    }
    const segment = this.identifySegment(segmentLocalId);
    const loader = this.getStreamHybridLoader(segment);
    void loader.loadSegment(segment, callbacks);
    // console.log(this.isLive, this.activeLevelBitrate);
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
    this.segmentStorage?.destroy();
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
      segmentId
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
        this.streamDetails as Required<StreamDetails>,
        this.settings,
        this.bandwidthCalculators,
        this.segmentStorage,
        this.eventHandlers
      );
    };
    const streamTypeLoaderKeyMap = {
      main: "mainStreamLoader",
      secondary: "secondaryStreamLoader",
    } as const;
    const { type } = segment.stream;
    const loaderKey = streamTypeLoaderKeyMap[type];

    return (this[loaderKey] =
      this[loaderKey] ?? createNewHybridLoader(this.manifestResponseUrl));
  }
}
