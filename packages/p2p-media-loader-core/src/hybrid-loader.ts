import { Segment, Stream, StreamWithSegments } from "./index";
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
  private readonly p2pLoaders: P2PLoadersContainer;
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
    private readonly bandwidthApproximator: BandwidthApproximator,
    private readonly segmentStorage: SegmentsMemoryStorage
  ) {
    this.lastRequestedSegment = requestedSegment;
    this.activeStream = requestedStream;
    this.playback = { position: requestedSegment.startTime, rate: 1 };

    if (!this.segmentStorage.isInitialized) {
      throw new Error("Segment storage is not initialized.");
    }
    this.segmentStorage.addIsSegmentLockedPredicate((segment) => {
      if (!this.activeStream.segments.has(segment.localId)) {
        return false;
      }
      const bufferRanges = Utils.getLoadBufferRanges(
        this.playback,
        this.settings
      );
      return Utils.isSegmentActual(segment, bufferRanges);
    });
    this.p2pLoaders = new P2PLoadersContainer(
      this.streamManifestUrl,
      requestedStream,
      this.requests,
      this.segmentStorage,
      this.settings
    );
  }

  // api method for engines
  async loadSegment(
    segment: Readonly<Segment>,
    stream: Readonly<StreamWithSegments>,
    callbacks: EngineCallbacks
  ) {
    if (this.activeStream !== stream) {
      this.activeStream = stream;
      this.p2pLoaders.changeActiveLoader(stream);
    }
    this.lastRequestedSegment = segment;
    void this.processQueue();

    const storageData = await this.segmentStorage.getSegmentData(
      stream,
      segment
    );
    if (storageData) {
      callbacks.onSuccess({
        data: storageData,
        bandwidth: this.bandwidthApproximator.getBandwidth(),
      });
    }
    this.requests.addEngineCallbacks(segment, callbacks);
  }

  private processQueue(force = true) {
    const now = performance.now();
    if (
      !force &&
      this.lastQueueProcessingTimeStamp !== undefined &&
      now - this.lastQueueProcessingTimeStamp >= 950
    ) {
      return;
    }
    this.lastQueueProcessingTimeStamp = now;

    const stream = this.activeStream;
    const { queue, queueSegmentIds } = Utils.generateQueue({
      segment: this.lastRequestedSegment,
      stream,
      playback: this.playback,
      settings: this.settings,
      isSegmentLoaded: (segment) =>
        this.segmentStorage.hasSegment(segment, stream),
    });

    this.requests.abortAllNotRequestedByEngine((segmentId) =>
      queueSegmentIds.has(segmentId)
    );

    const { simultaneousHttpDownloads, simultaneousP2PDownloads } =
      this.settings;
    for (const { segment, statuses } of queue) {
      // const timeToPlayback = getTimeToSegmentPlayback(segment, this.playback);
      if (statuses.isHighDemand) {
        if (this.requests.isHttpRequested(segment.localId)) continue;
        // const request = this.requests.get(segment.localId);
        // if (request?.loaderRequest?.type === "p2p") {
        //   const remainingDownloadTime = getPredictedRemainingDownloadTime(
        //     request.loaderRequest
        //   );
        //   if (
        //     remainingDownloadTime === undefined ||
        //     remainingDownloadTime > timeToPlayback
        //   ) {
        //     request.loaderRequest.abort();
        //   } else {
        //     continue;
        //   }
        // }
        if (this.requests.httpRequestsCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(stream, segment);
          continue;
        }

        this.abortLastHttpLoadingAfter(queue, segment.localId);
        if (this.requests.httpRequestsCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(stream, segment);
          continue;
        }

        if (this.requests.p2pRequestsCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(segment);
        }

        this.abortLastP2PLoadingAfter(queue, segment.localId);
        if (this.requests.p2pRequestsCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(segment);
          continue;
        }
      }
      if (statuses.isP2PDownloadable) {
        if (this.requests.p2pRequestsCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(stream, segment);
        }
      }
      break;
    }
  }

  // api method for engines
  abortSegment(segmentId: string) {
    this.requests.abortEngineRequest(segmentId);
  }

  private async loadThroughHttp(stream: Stream, segment: Segment) {
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
    if (data) this.onSegmentLoaded(stream, segment, data);
  }

  private async loadThroughP2P(stream: Stream, segment: Segment) {
    const p2pLoader = this.p2pLoaders.activeLoader;
    const data = await p2pLoader.downloadSegment(segment);
    if (data) this.onSegmentLoaded(stream, segment, data);
  }

  private onSegmentLoaded(stream: Stream, segment: Segment, data: ArrayBuffer) {
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(stream, segment, data);
    this.requests.resolveEngineRequest(segment.localId, {
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
    this.processQueue();
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

  private abortLastP2PLoadingAfter(queue: QueueItem[], segmentId: string) {
    for (const {
      segment: { localId: queueSegmentId },
    } of arrayBackwards(queue)) {
      if (queueSegmentId === segmentId) break;
      if (this.requests.isP2PRequested(queueSegmentId)) {
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
    this.p2pLoaders.destroy();
  }
}

function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
  }
}

type P2PLoaderContainerItem = {
  streamId: string;
  loader: P2PLoader;
  destroyTimeoutId?: number;
};

class P2PLoadersContainer {
  private readonly loaders = new Map<string, P2PLoaderContainerItem>();
  private _activeLoaderItem: P2PLoaderContainerItem;

  constructor(
    private readonly streamManifestUrl: string,
    stream: StreamWithSegments,
    private readonly requests: RequestContainer,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly settings: Settings
  ) {
    this._activeLoaderItem = this.createLoaderItem(stream);
  }

  createLoaderItem(stream: StreamWithSegments) {
    if (this.loaders.has(stream.localId)) {
      throw new Error("Loader for this stream already exists");
    }
    const loader = new P2PLoader(
      this.streamManifestUrl,
      stream,
      this.requests,
      this.segmentStorage,
      this.settings
    );
    const item = { loader, streamId: stream.localId };
    this.loaders.set(stream.localId, item);
    this._activeLoaderItem = item;
    return item;
  }

  changeActiveLoader(stream: StreamWithSegments) {
    const loaderItem = this.loaders.get(stream.localId);
    const prevActive = this._activeLoaderItem;
    if (loaderItem) {
      this._activeLoaderItem = loaderItem;
      clearTimeout(loaderItem.destroyTimeoutId);
    } else {
      this.createLoaderItem(stream);
    }
    this.setLoaderDestroyTimeout(prevActive);
  }

  private setLoaderDestroyTimeout(item: P2PLoaderContainerItem) {
    item.destroyTimeoutId = window.setTimeout(() => {
      item.loader.destroy();
      this.loaders.delete(item.streamId);
    }, this.settings.p2pLoaderDestroyTimeout);
  }

  get activeLoader() {
    return this._activeLoaderItem.loader;
  }

  destroy() {
    for (const { loader, destroyTimeoutId } of this.loaders.values()) {
      loader.destroy();
      clearTimeout(destroyTimeoutId);
    }
    this.loaders.clear();
  }
}

// function getTimeToSegmentPlayback(segment: Segment, playback: Playback) {
//   return Math.max(segment.startTime - playback.position, 0) / playback.rate;
// }
//
// function getPredictedRemainingDownloadTime(request: HybridLoaderRequest) {
//   const { startTimestamp, progress } = request;
//   if (!progress || progress.percent === 0) return undefined;
//   const now = performance.now();
//   const bandwidth =
//     progress.percent / (progress.lastLoadedChunkTimestamp - startTimestamp);
//   const remainingDownloadPercent = 100 - progress.percent;
//   const predictedRemainingTimeFromLastDownload =
//     remainingDownloadPercent / bandwidth;
//   const timeFromLastDownload = now - progress.lastLoadedChunkTimestamp;
//   return predictedRemainingTimeFromLastDownload - timeFromLastDownload;
// }
