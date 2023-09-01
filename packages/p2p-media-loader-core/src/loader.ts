import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import { HttpLoader } from "./http-loader";
import { LoadQueue } from "./load-queue";
import { SegmentsMemoryStorage } from "./segments-storage";

export class Loader {
  private readonly queue: LoadQueue;
  private readonly httpLoader = new HttpLoader();
  private readonly pluginRequests = new Map<string, Request>();

  constructor(
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly settings: {
      highDemandBufferLength: number;
      httpBufferLength: number;
      p2pBufferLength: number;
      simultaneousHttpDownloads: number;
    }
  ) {
    this.queue = new LoadQueue(this.settings);
    this.queue.subscribeToUpdate(this.onQueueChanged.bind(this));
    this.queue.setIsSegmentLoadedPredicate(this.isSegmentLoaded.bind(this));
  }

  async loadSegment(
    segment: Segment,
    stream: StreamWithSegments
  ): Promise<SegmentResponse> {
    this.queue.updateIfStreamChanged(segment, stream);
    const storageData = this.segmentStorage.getSegment(segment.localId);
    if (storageData) {
      return {
        data: storageData,
        bandwidth: 99999999,
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
    this.segmentStorage.storeSegment(segment, data);
    const request = this.pluginRequests.get(segment.localId);
    if (request) {
      request.onSuccess({
        bandwidth: 9999999999,
        data,
      });
    }
    this.queue.removeLoadedSegment(segment.localId);
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

  onPlaybackUpdate(position: number, rate: number) {
    this.queue.playbackUpdate(position, rate);
  }

  private onQueueChanged(removedSegmentIds: string[]) {
    removedSegmentIds.forEach((id) => this.httpLoader.abort(id));
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
      onSuccess: onSuccess!,
      onError: onError!,
    };

    this.pluginRequests.set(segment.localId, request);
    return request;
  }
}

type Request = {
  responsePromise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};
