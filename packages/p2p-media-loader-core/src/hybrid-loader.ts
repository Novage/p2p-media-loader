import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { HttpLoader } from "./http-loader";
import { LoadQueue } from "./load-queue";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { Playback } from "./playback";
import * as Utils from "./utils";
import { BandwidthApproximator } from "./bandwidth-approximator";

export class HybridLoader {
  private readonly queue: LoadQueue;
  private readonly httpLoader = new HttpLoader();
  private readonly pluginRequests = new Map<string, Request>();
  private readonly segmentStorage: SegmentsMemoryStorage;
  private storageCleanUpIntervalId?: number;
  private readonly playback: Playback;

  constructor(
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    this.segmentStorage = new SegmentsMemoryStorage(this.settings);
    this.playback = new Playback(this.settings);
    this.queue = new LoadQueue(this.playback);
    this.queue.subscribeToUpdate(this.onQueueUpdated.bind(this));
    this.queue.setIsSegmentLoadedPredicate(this.isSegmentLoaded.bind(this));
    this.segmentStorage.setIsSegmentLockedPredicate((segment) => {
      const stream = this.queue.activeStream;
      return !!(
        stream?.segments.has(segment.localId) &&
        Utils.getSegmentLoadStatuses(segment, this.playback)
      );
    });

    this.storageCleanUpIntervalId = setInterval(
      () => this.segmentStorage.clear(),
      1000
    );
  }

  async loadSegment(
    segment: Segment,
    stream: StreamWithSegments
  ): Promise<SegmentResponse> {
    if (!this.playback.isInitialized()) {
      this.playback.position = segment.startTime;
    }
    this.queue.updateIfStreamChanged(segment, stream);
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

  abortSegment(segmentId: string) {
    this.httpLoader.abort(segmentId);
  }

  private processQueue() {
    const { simultaneousHttpDownloads } = this.settings;
    for (const { segment, statuses } of this.queue.items()) {
      if (this.httpLoader.isLoading(segment.localId)) continue;
      if (statuses.has("high-demand")) {
        if (this.httpLoader.getLoadingsAmount() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment);
          continue;
        }
        this.abortLastHttpLoadingAfter(segment.localId);
        if (this.httpLoader.getLoadingsAmount() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment);
        }
      }
      break;
    }
  }

  private async loadSegmentThroughHttp(segment: Segment) {
    const data = await this.httpLoader.load(segment);
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(segment, data);
    this.queue.removeLoadedSegment(segment.localId);
    const request = this.pluginRequests.get(segment.localId);
    if (request) {
      request.onSuccess({
        bandwidth: this.bandwidthApproximator.getBandwidth(),
        data,
      });
    }
    this.pluginRequests.delete(segment.localId);
  }

  private abortLastHttpLoadingAfter(segmentId: string) {
    for (const { segment } of this.queue.itemsBackwards()) {
      if (segment.localId === segmentId) break;
      if (this.httpLoader.isLoading(segment.localId)) {
        this.httpLoader.abort(segment.localId);
        break;
      }
    }
  }

  updatePlayback(position: number, rate?: number) {
    this.playback.position = position;
    if (rate !== undefined) this.playback.rate = rate;
    this.queue.playbackUpdate();
  }

  private onQueueUpdated(removedSegmentIds?: string[]) {
    removedSegmentIds?.forEach((id) => {
      this.httpLoader.abort(id);
      const request = this.pluginRequests.get(id);
      if (request) request.onError("aborted");
      this.pluginRequests.delete(id);
    });
    this.processQueue();
  }

  private isSegmentLoaded(segmentId: string): boolean {
    return this.segmentStorage.hasSegment(segmentId);
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
    this.queue.clear();
    clearInterval(this.storageCleanUpIntervalId);
    this.storageCleanUpIntervalId = undefined;
    void this.segmentStorage.clear();
    this.httpLoader.abortAll();
    for (const request of this.pluginRequests.values()) {
      request.onError("Aborted");
    }
    this.pluginRequests.clear();
    this.playback.clear();
  }
}

type Request = {
  responsePromise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};
