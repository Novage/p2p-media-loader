import { Segment, StreamWithSegments } from "./index";
import { getHttpSegmentRequest } from "./http-loader";
import { P2PLoader } from "./p2p-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import { RequestContainer, EngineCallbacks } from "./request";
import * as Utils from "./utils";
import { FetchError } from "./errors";

export class HybridLoader {
  private readonly requests = new RequestContainer();
  private p2pLoader?: P2PLoader;
  private readonly segmentStorage: SegmentsMemoryStorage;
  private storageCleanUpIntervalId?: number;
  private activeStream: Readonly<StreamWithSegments>;
  private lastRequestedSegment: Readonly<Segment>;
  private readonly playback: Playback;
  private lastQueueProcessingTimeStamp?: number;

  constructor(
    private streamManifestUrl: string,
    requestedSegment: Segment,
    requestedStream: Readonly<StreamWithSegments>,
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    this.lastRequestedSegment = requestedSegment;
    this.activeStream = requestedStream;
    this.playback = { position: requestedSegment.startTime, rate: 1 };
    this.segmentStorage = new SegmentsMemoryStorage(this.settings);
    this.segmentStorage.setIsSegmentLockedPredicate((segment) => {
      if (!this.activeStream.segments.has(segment.localId)) {
        return false;
      }
      const bufferRanges = Utils.getLoadBufferRanges(
        this.playback,
        this.settings
      );
      return Utils.isSegmentActual(segment, bufferRanges);
    });

    this.storageCleanUpIntervalId = window.setInterval(
      () => this.segmentStorage.clear(),
      1000
    );
  }

  private createP2PLoader(stream: StreamWithSegments) {
    this.p2pLoader = new P2PLoader(
      this.streamManifestUrl,
      stream,
      this.requests,
      this.segmentStorage
    );
  }

  // api method for engines
  async loadSegment(
    segment: Readonly<Segment>,
    stream: Readonly<StreamWithSegments>,
    callbacks: EngineCallbacks
  ) {
    if (stream !== this.activeStream) {
      this.activeStream = stream;
      this.createP2PLoader(stream);
    }
    this.lastRequestedSegment = segment;
    void this.processQueue();

    const storageData = await this.segmentStorage.getSegmentData(
      segment.localId
    );
    if (storageData) {
      callbacks.onSuccess({
        data: storageData,
        bandwidth: this.bandwidthApproximator.getBandwidth(),
      });
    }
    this.requests.addEngineCallbacks(segment, callbacks);
  }

  private async processQueue(force = true) {
    const now = performance.now();
    if (
      !force &&
      this.lastQueueProcessingTimeStamp !== undefined &&
      now - this.lastQueueProcessingTimeStamp >= 950
    ) {
      return;
    }
    this.lastQueueProcessingTimeStamp = now;

    const { queue, queueSegmentIds } = Utils.generateQueue({
      segment: this.lastRequestedSegment,
      stream: this.activeStream,
      playback: this.playback,
      settings: this.settings,
      isSegmentLoaded: (segmentId) => this.segmentStorage.hasSegment(segmentId),
    });

    this.requests.abortAllNotRequestedByEngine((segmentId) =>
      queueSegmentIds.has(segmentId)
    );

    const { simultaneousHttpDownloads } = this.settings;
    for (const { segment, statuses } of queue) {
      if (this.requests.isHttpRequested(segment.localId)) continue;
      if (statuses.isHighDemand) {
        if (this.requests.countHttpRequests() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment);
          continue;
        }
        this.abortLastHttpLoadingAfter(queue, segment.localId);
        if (this.requests.countHttpRequests() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment);
        }
      }
      break;
    }
  }

  // api method for engines
  abortSegment(segmentId: string) {
    this.requests.abortEngineRequest(segmentId);
  }

  private async loadSegmentThroughHttp(segment: Segment) {
    let data: ArrayBuffer | undefined;
    try {
      const httpRequest = getHttpSegmentRequest(segment);
      this.requests.addLoaderRequest(segment, httpRequest);
      data = await httpRequest.promise;
    } catch (err) {
      if (err instanceof FetchError) {
        // TODO: handle error
      }
    }
    if (data) this.handleSegmentLoaded(segment, data);
  }

  private async loadThroughP2P(segment: Segment) {
    if (!this.p2pLoader) return;
    const data = await this.p2pLoader.downloadSegment(segment);
    if (data) this.handleSegmentLoaded(segment, data);
  }

  private handleSegmentLoaded(segment: Segment, data: ArrayBuffer) {
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(segment, data);
    this.requests.resolveEngineRequest(segment.localId, {
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
  }

  private abortLastHttpLoadingAfter(queue: QueueItem[], segmentId: string) {
    for (const {
      segment: { localId: queueSegmentId },
    } of arrayBackwards(queue)) {
      if (queueSegmentId === segmentId) break;
      if (this.requests.isHttpRequested(queueSegmentId)) {
        this.requests.abortLoaderRequest(queueSegmentId);
        break;
      }
    }
  }

  updatePlayback(position: number, rate: number) {
    const isRateChanged = this.playback.rate !== rate;
    const isPositionChanged = this.playback.position !== position;

    if (!isRateChanged && !isPositionChanged) return;

    if (isPositionChanged) this.playback.position = position;
    if (isRateChanged) this.playback.rate = rate;
    void this.processQueue(false);
  }

  destroy() {
    clearInterval(this.storageCleanUpIntervalId);
    this.storageCleanUpIntervalId = undefined;
    void this.segmentStorage.destroy();
    this.requests.destroy();
  }
}

function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
  }
}
