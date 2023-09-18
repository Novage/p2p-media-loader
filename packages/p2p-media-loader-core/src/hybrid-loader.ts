import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { loadSegmentThroughHttp } from "./http-loader";
import { P2PLoader } from "./p2p-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import { RequestContainer } from "./request";
import * as Utils from "./utils";
import { FetchError } from "./errors";

export class HybridLoader {
  private streamManifestUrl?: string;
  private readonly requests = new RequestContainer();
  private p2pLoader?: P2PLoader;
  private readonly segmentStorage: SegmentsMemoryStorage;
  private storageCleanUpIntervalId?: number;
  private activeStream?: Readonly<StreamWithSegments>;
  private lastRequestedSegment?: Readonly<Segment>;
  private playback?: Playback;
  private lastQueueProcessingTimeStamp?: number;

  constructor(
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    this.segmentStorage = new SegmentsMemoryStorage(this.settings);
    this.segmentStorage.setIsSegmentLockedPredicate((segment) => {
      if (!this.playback || !this.activeStream?.segments.has(segment.localId)) {
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

  setStreamManifestUrl(url: string) {
    this.streamManifestUrl = url;
  }

  private createP2PLoader(stream: StreamWithSegments) {
    if (!this.streamManifestUrl) return;
    this.p2pLoader = new P2PLoader(
      this.streamManifestUrl,
      stream,
      this.segmentStorage
    );
  }

  async loadSegmentByEngine(
    segment: Readonly<Segment>,
    stream: Readonly<StreamWithSegments>
  ): Promise<SegmentResponse> {
    if (!this.playback) {
      this.playback = { position: segment.startTime, rate: 1 };
    }
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
      return {
        data: storageData,
        bandwidth: this.bandwidthApproximator.getBandwidth(),
      };
    }
    const request = Utils.getControlledPromise<SegmentResponse>();
    this.requests.addEngineRequest(segment, request);
    return request.promise;
  }

  private async processQueue(force = true) {
    if (!this.activeStream || !this.lastRequestedSegment || !this.playback) {
      return;
    }
    const now = performance.now();
    if (
      !force &&
      this.lastQueueProcessingTimeStamp !== undefined &&
      now - this.lastQueueProcessingTimeStamp >= 950
    ) {
      return;
    }
    this.lastQueueProcessingTimeStamp = now;

    const storedSegmentIds = await this.segmentStorage.getStoredSegmentIds();
    const { queue, queueSegmentIds } = Utils.generateQueue({
      segment: this.lastRequestedSegment,
      stream: this.activeStream,
      playback: this.playback,
      settings: this.settings,
      isSegmentLoaded: (segmentId) => storedSegmentIds.has(segmentId),
    });

    this.requests.abortAllNotRequestedByEngine((segmentId) =>
      queueSegmentIds.has(segmentId)
    );

    const { simultaneousHttpDownloads } = this.settings;
    for (const { segment, statuses } of queue) {
      if (this.requests.isHttpRequested(segment.localId)) continue;
      if (statuses.has("high-demand")) {
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

  abortSegmentByEngine(segmentId: string) {
    this.requests.abortEngineRequest(segmentId);
  }

  private async loadSegmentThroughHttp(segment: Segment) {
    let data: ArrayBuffer | undefined;
    try {
      const httpRequest = loadSegmentThroughHttp(segment);
      this.requests.addLoaderRequest(segment, httpRequest);
      data = await httpRequest.promise;
    } catch (err) {
      if (err instanceof FetchError) {
        // TODO: handle error
      }
    }
    if (!data) return;
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
    if (!this.playback) return;
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
    this.playback = undefined;
  }
}

function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
  }
}
