import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { loadSegmentHttp } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import { RequestContainer } from "./request";
import * as Utils from "./utils";

export class HybridLoader {
  private readonly requests = new RequestContainer();
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

  async loadSegment(
    segment: Readonly<Segment>,
    stream: Readonly<StreamWithSegments>
  ): Promise<SegmentResponse> {
    if (!this.playback) {
      this.playback = { position: segment.startTime, rate: 1 };
    }
    if (stream !== this.activeStream) this.activeStream = stream;
    this.lastRequestedSegment = segment;
    this.processQueue();

    const storageData = await this.segmentStorage.getSegment(segment.localId);
    if (storageData) {
      return {
        data: storageData,
        bandwidth: this.bandwidthApproximator.getBandwidth(),
      };
    }
    return this.createPluginSegmentRequest(segment);
  }

  private processQueue(force = true) {
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

    const { queue, queueSegmentIds } = Utils.generateQueue({
      segment: this.lastRequestedSegment,
      stream: this.activeStream,
      playback: this.playback,
      settings: this.settings,
      isSegmentLoaded: (segmentId) => this.segmentStorage.has(segmentId),
    });

    this.requests.abortNotRequestedByEngine((segmentId) =>
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

  abortSegment(segmentId: string) {
    this.requests.abort(segmentId);
  }

  private async loadSegmentThroughHttp(segment: Segment) {
    const request = loadSegmentHttp(segment);
    this.requests.addHybridLoaderRequest(segment, request);
    let data: ArrayBuffer | undefined;
    try {
      data = await request.promise;
    } catch (err) {
      // TODO: handle abort
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
    for (const { segment } of arrayBackwards(queue)) {
      if (segment.localId === segmentId) break;
      if (this.requests.isHttpRequested(segment.localId)) {
        this.abortSegment(segment.localId);
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
    this.processQueue(false);
  }

  private createPluginSegmentRequest(segment: Segment) {
    const request = getControlledPromise<SegmentResponse>();
    this.requests.addPlayerRequest(segment, request);
    return request.promise;
  }

  destroy() {
    clearInterval(this.storageCleanUpIntervalId);
    this.storageCleanUpIntervalId = undefined;
    void this.segmentStorage.destroy();
    this.requests.destroy();
    this.playback = undefined;
  }
}

function getControlledPromise<T>() {
  let onSuccess: (value: T) => void;
  let onError: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    onSuccess = resolve;
    onError = reject;
  });

  return {
    promise,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    onSuccess: onSuccess!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    onError: onError!,
  };
}

function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
  }
}
