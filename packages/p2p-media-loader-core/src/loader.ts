import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import * as Utils from "./utils";
import { HttpLoader } from "./http-loader";
import { LoadQueue, QueueItem } from "./load-queue";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Playback } from "./playback";

export class Loader {
  private manifestResponseUrl?: string;
  private readonly httpLoader = new HttpLoader();
  private readonly mainQueue: LoadQueue;
  private readonly secondaryQueue: LoadQueue;
  private readonly pluginRequests = new Map<string, Request>();

  constructor(
    private readonly streams: Map<string, StreamWithSegments>,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly playback: Playback,
    private readonly settings: { simultaneousHttpDownloads: number }
  ) {
    this.mainQueue = new LoadQueue(this.playback, this.segmentStorage);
    this.secondaryQueue = new LoadQueue(this.playback, this.segmentStorage);
    this.playback.subscribeToUpdate(this.onPlaybackUpdate.bind(this));
    // setInterval(() => this.loadRandomSegmentThroughHttp(), 1000);
  }

  setManifestResponseUrl(url: string) {
    this.manifestResponseUrl = url;
  }

  async requestSegmentByPlugin(segmentId: string): Promise<SegmentResponse> {
    const { segment, stream } = this.identifySegment(segmentId);

    const queue = stream.type === "main" ? this.mainQueue : this.secondaryQueue;

    const { segmentsToAbortIds } = queue.update(segment, stream);
    this.abortSegments(segmentsToAbortIds);
    this.processQueues();

    const data = this.segmentStorage.getSegment(segmentId);
    if (data) {
      return {
        url: segment.url,
        data,
        bandwidth: 999999999,
        status: 200,
        ok: true,
      };
    }
    const request = this.createPluginSegmentRequest(segment);
    return request.promise;
  }

  private processQueues() {
    const { simultaneousHttpDownloads } = this.settings;

    for (const [
      { segment, statuses },
      queue,
    ] of this.getQueuesSegmentsToLoad()) {
      if (statuses.has("high-demand")) {
        if (this.httpLoader.getLoadingsAmount() < simultaneousHttpDownloads) {
          void this.loadSegmentThroughHttp(segment, queue);
          continue;
        }
        const lastItem = queue.getLastHttpLoadingItemAfter(segment.localId);
        if (lastItem) {
          this.httpLoader.abort(lastItem.segment.localId);
          queue.markSegmentAsNotLoading(lastItem.segment.localId);
          void this.loadSegmentThroughHttp(segment, queue);
        }
      }
      break;
    }
  }

  private *getQueuesSegmentsToLoad() {
    const mainGen = this.mainQueue.getSegmentsToLoad();
    const secondaryGen = this.secondaryQueue.getSegmentsToLoad();
    let item1: QueueItem | undefined;
    let item2: QueueItem | undefined;

    const retrieveMinTimeItem = (): [QueueItem, LoadQueue] | undefined => {
      item1 = item1 ?? (mainGen.next().value as QueueItem | undefined);
      item2 = item2 ?? (secondaryGen.next().value as QueueItem | undefined);

      if (!item1 && !item2) return undefined;
      if (item1 && item2) {
        if (item1.segment.startTime < item2.segment.startTime) {
          const result = item1;
          item1 = undefined;
          return [result, this.mainQueue];
        } else {
          const result = item2;
          item2 = undefined;
          return [result, this.secondaryQueue];
        }
      }
      if (item1) {
        const result: [QueueItem, LoadQueue] = [item1, this.mainQueue];
        item1 = undefined;
        return result;
      }
      if (item2) {
        const result: [QueueItem, LoadQueue] = [item2, this.secondaryQueue];
        item2 = undefined;
        return result;
      }
    };

    let item: [QueueItem, LoadQueue] | undefined;
    do {
      item = retrieveMinTimeItem();
      if (item) yield item;
    } while (item);
  }

  private async loadSegmentThroughHttp(segment: Segment, queue: LoadQueue) {
    queue.markSegmentAsLoading(segment.localId, "http");
    const response = await this.httpLoader.load(segment);
    this.segmentStorage.storeSegment(segment, response.data);
    const request = this.pluginRequests.get(segment.localId);
    if (request) {
      request.onSuccess({
        bandwidth: 9999999999,
        data: response.data,
        ok: response.ok,
        status: response.status,
        url: response.url,
      });
    }
    queue.removeLoadedSegment(segment.localId);
  }

  private async loadRandomSegmentThroughHttp() {
    if (
      this.httpLoader.getLoadingsAmount() >
      this.settings.simultaneousHttpDownloads
    ) {
      return;
    }
    const randomSegmentInfo = this.mainQueue.getRandomHttpLoadableSegment();
    if (!randomSegmentInfo) return;

    void this.loadSegmentThroughHttp(randomSegmentInfo.segment, this.mainQueue);
  }

  private identifySegment(segmentId: string) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

    const { stream, segment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentId) ?? {};
    if (!segment || !stream) {
      throw new Error(`Not found segment with id: ${segmentId}`);
    }

    return { segment, stream };
  }

  private onPlaybackUpdate() {
    const { segmentsToAbortIds: mainIds } =
      this.mainQueue.clearNotInLoadRangeSegments();
    const { segmentsToAbortIds: secondaryIds } =
      this.secondaryQueue.clearNotInLoadRangeSegments();

    this.abortSegments(mainIds);
    this.abortSegments(secondaryIds);
    this.processQueues();
  }

  abortSegment(segmentId: string) {
    this.httpLoader.abort(segmentId);
  }

  private abortSegments(segmentIds: string[]) {
    segmentIds.forEach((id) => this.abortSegment(id));
  }

  private createPluginSegmentRequest(segment: Segment) {
    let onSuccess: Request["onSuccess"];
    const promise = new Promise<SegmentResponse>((resolve, reject) => {
      onSuccess = resolve;
    });
    const request: Request = {
      promise,
      onSuccess: (res: SegmentResponse) => {
        console.log("success");
        onSuccess(res)!;
      },
    };

    this.pluginRequests.set(segment.localId, request);
    return request;
  }
}

type Request = {
  promise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
};

async function trackTime<T>(
  action: () => T,
  unit: "s" | "ms" = "s"
): Promise<[Awaited<T>, number]> {
  const start = performance.now();
  const result = await action();
  const duration = performance.now() - start;
  return [result, unit === "ms" ? duration : duration / 1000];
}
