import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { HttpLoader, loadSegmentHttp } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import { RequestContainer } from "./request";
import * as Utils from "./utils";

export class HybridLoader {
  private readonly httpLoader = new HttpLoader();
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

    this.storageCleanUpIntervalId = setInterval(
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
    const request = this.createPluginSegmentRequest(segment);
    return request.responsePromise;
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

    const bufferRanges = Utils.getLoadBufferRanges(
      this.playback,
      this.settings
    );
    for (const segmentId of this.getLoadingSegmentIds()) {
      const segment = this.activeStream.segments.get(segmentId);
      if (
        !queueSegmentIds.has(segmentId) &&
        !this.pluginRequests.has(segmentId) &&
        !(segment && Utils.isSegmentActual(segment, bufferRanges))
      ) {
        this.abortSegment(segmentId);
      }
    }

    const { simultaneousHttpDownloads } = this.settings;
    for (const { segment, statuses } of queue) {
      if (this.httpLoader.isLoading(segment.localId)) continue;
      if (statuses.has("high-demand")) {
        if (this.httpLoader.getLoadingsAmount() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment);
          continue;
        }
        this.abortLastHttpLoadingAfter(queue, segment.localId);
        if (this.httpLoader.getLoadingsAmount() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment);
        }
      }
      break;
    }
  }

  getLoadingSegmentIds() {
    return this.httpLoader.getLoadingSegmentIds();
  }

  abortSegment(segmentId: string) {
    this.httpLoader.abort(segmentId);
    const request = this.pluginRequests.get(segmentId);
    if (!request) return;
    request.onError("Abort");
    this.pluginRequests.delete(segmentId);
  }

  private async loadSegmentThroughHttp(segment: Segment) {
    const request = loadSegmentHttp(segment);
    let data: ArrayBuffer | undefined;
    try {
      data = loadSegmentHttp();
    } catch (err) {
      // TODO: handle abort
    }
    // if (!data) return;
    // this.bandwidthApproximator.addBytes(data.byteLength);
    // void this.segmentStorage.storeSegment(segment, data);
    // const request = this.pluginRequests.get(segment.localId);
    // if (request) {
    //   request.onSuccess({
    //     bandwidth: this.bandwidthApproximator.getBandwidth(),
    //     data,
    //   });
    // }
    // this.pluginRequests.delete(segment.localId);
  }

  private abortLastHttpLoadingAfter(queue: QueueItem[], segmentId: string) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const { segment } = queue[i];
      if (segment.localId === segmentId) break;
      if (this.httpLoader.isLoading(segment.localId)) {
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
    let onSuccess: PlayerRequest["onSuccess"];
    let onError: PlayerRequest["onError"];
    const responsePromise = new Promise<SegmentResponse>((resolve, reject) => {
      onSuccess = resolve;
      onError = reject;
    });
    const request: PlayerRequest = {
      responsePromise,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onSuccess: onSuccess!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onError: onError!,
    };

    this.pluginRequests.set(segment.localId, request);
    return request;
  }

  destroy() {
    clearInterval(this.storageCleanUpIntervalId);
    this.storageCleanUpIntervalId = undefined;
    void this.segmentStorage.destroy();
    this.httpLoader.abortAll();
    for (const request of this.pluginRequests.values()) {
      request.onError("Aborted");
    }
    this.pluginRequests.clear();
    this.playback = undefined;
  }
}
