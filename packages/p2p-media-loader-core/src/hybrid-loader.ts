import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { HttpLoader } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import * as Utils from "./utils";

export class HybridLoader {
  private readonly httpLoader = new HttpLoader();
  private readonly pluginRequests = new Map<string, Request>();
  private readonly segmentStorage: SegmentsMemoryStorage;
  private storageCleanUpIntervalId?: number;
  private readonly playback: Playback = { position: 0, rate: 1 };
  private activeStream?: Readonly<StreamWithSegments>;
  private lastRequestedSegment?: Readonly<Segment>;
  private segmentAvgLength?: number;

  constructor(
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    this.segmentStorage = new SegmentsMemoryStorage(this.settings);
    this.segmentStorage.setIsSegmentLockedPredicate((segment) => {
      if (!this.activeStream?.segments.has(segment.localId)) return false;
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

  private computeSegmentAvgLength(stream: StreamWithSegments) {
    if (!stream.segments.size) return;
    let sum = 0;
    for (const segment of stream.segments.values()) {
      sum += segment.endTime - segment.startTime;
    }
    this.segmentAvgLength = sum / stream.segments.size;
  }

  async loadSegment(
    segment: Readonly<Segment>,
    stream: Readonly<StreamWithSegments>
  ): Promise<SegmentResponse> {
    if (stream !== this.activeStream) this.computeSegmentAvgLength(stream);
    this.activeStream = stream;
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

  private processQueue() {
    if (!this.activeStream || !this.lastRequestedSegment) return;

    const { queue, queueSegmentIds } = Utils.generateQueue({
      segment: this.lastRequestedSegment,
      stream: this.activeStream,
      playback: this.playback,
      segmentStorage: this.segmentStorage,
      settings: this.settings,
    });

    for (const segmentId of this.getLoadingSegmentIds()) {
      if (!queueSegmentIds.has(segmentId)) {
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
    const data = await this.httpLoader.load(segment);
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(segment, data);
    const request = this.pluginRequests.get(segment.localId);
    if (request) {
      request.onSuccess({
        bandwidth: this.bandwidthApproximator.getBandwidth(),
        data,
      });
    }
    this.pluginRequests.delete(segment.localId);
  }

  private abortLastHttpLoadingAfter(queue: QueueItem[], segmentId: string) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const { segment } = queue[i];
      if (segment.localId === segmentId) break;
      if (this.httpLoader.isLoading(segment.localId)) {
        this.httpLoader.abort(segment.localId);
        break;
      }
    }
  }

  updatePlayback(position: number, rate?: number) {
    const isRateChanged = rate !== undefined && this.playback.rate !== rate;
    const isPositionSignificantlyChanged =
      this.segmentAvgLength === undefined ||
      Math.abs(position - this.playback.position) / this.segmentAvgLength >=
        0.45;

    if (!isRateChanged && !isPositionSignificantlyChanged) return;

    if (isPositionSignificantlyChanged) this.playback.position = position;
    if (isRateChanged) this.playback.rate = rate;
    this.processQueue();
  }

  private createPluginSegmentRequest(segment: Segment) {
    let onSuccess: Request["onSuccess"];
    let onError: Request["onError"];
    const responsePromise = new Promise<SegmentResponse>((resolve, reject) => {
      onSuccess = resolve;
      onError = reject;
    });
    const request: Request = {
      responsePromise,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onSuccess: onSuccess!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onError: onError!,
    };

    this.pluginRequests.set(segment.localId, request);
    return request;
  }

  clear() {
    clearInterval(this.storageCleanUpIntervalId);
    this.storageCleanUpIntervalId = undefined;
    void this.segmentStorage.clear();
    this.httpLoader.abortAll();
    for (const request of this.pluginRequests.values()) {
      request.onError("Aborted");
    }
    this.pluginRequests.clear();
    // TODO: clear playback
  }
}

type Request = {
  responsePromise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};
