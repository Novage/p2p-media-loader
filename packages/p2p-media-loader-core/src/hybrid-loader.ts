import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { HttpLoader } from "./http-loader";
import { P2PLoader } from "./p2p-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import * as Utils from "./utils";

export class HybridLoader {
  private streamManifestUrl?: string;
  private readonly httpLoader = new HttpLoader();
  private p2pLoader?: P2PLoader;
  private readonly pluginRequests = new Map<string, Request>();
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

  async loadSegment(
    segment: Readonly<Segment>,
    stream: Readonly<StreamWithSegments>
  ): Promise<SegmentResponse> {
    if (!this.playback) {
      this.playback = { position: segment.startTime, rate: 1 };
    }
    if (stream !== this.activeStream) {
      this.activeStream = stream;
      if (this.streamManifestUrl) {
        const streamExternalId = Utils.getStreamExternalId(
          stream,
          this.streamManifestUrl
        );
        this.p2pLoader = new P2PLoader(streamExternalId);
        void this.updateSegmentsLoadingState();
      }
    }
    this.lastRequestedSegment = segment;
    void this.processQueue();

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
    let data: ArrayBuffer | undefined;
    try {
      data = await this.httpLoader.load(segment);
    } catch (err) {
      // TODO: handle abort
    }
    if (!data) return;
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(segment, data);
    void this.updateSegmentsLoadingState();
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
    void this.processQueue(false);
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

  private async updateSegmentsLoadingState() {
    if (!this.streamManifestUrl || !this.activeStream || !this.p2pLoader) {
      return;
    }
    const storedSegmentIds = await this.segmentStorage.getStoredSegmentIds();
    const loaded: Segment[] = [];

    for (const id of storedSegmentIds) {
      const segment = this.activeStream.segments.get(id);
      if (!segment) continue;

      loaded.push(segment);
    }

    void this.p2pLoader.updateSegmentsLoadingState(loaded, []);
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

type Request = {
  responsePromise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};
