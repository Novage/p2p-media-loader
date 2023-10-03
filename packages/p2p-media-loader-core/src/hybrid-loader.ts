import { Segment, StreamWithSegments } from "./index";
import { getHttpSegmentRequest } from "./http-loader";
import { P2PLoader } from "./p2p-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem, QueueItemStatuses } from "./internal-types";
import { RequestContainer, EngineCallbacks } from "./request";
import * as QueueUtils from "./utils/queue-utils";
import { FetchError } from "./errors";

export class HybridLoader {
  private readonly requests = new RequestContainer();
  private readonly p2pLoaders: P2PLoadersContainer;
  private storageCleanUpIntervalId?: number;
  private lastRequestedSegment: Readonly<Segment>;
  private readonly playback: Playback;
  private lastQueueProcessingTimeStamp?: number;
  private readonly segmentAvgDuration: number;
  private readonly randomHttpDownloadInterval: number;

  constructor(
    private streamManifestUrl: string,
    requestedSegment: Segment,
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator,
    private readonly segmentStorage: SegmentsMemoryStorage
  ) {
    this.lastRequestedSegment = requestedSegment;
    const activeStream = requestedSegment.stream;
    this.playback = { position: requestedSegment.startTime, rate: 1 };
    this.segmentAvgDuration = getSegmentAvgDuration(activeStream);

    if (!this.segmentStorage.isInitialized) {
      throw new Error("Segment storage is not initialized.");
    }
    this.segmentStorage.addIsSegmentLockedPredicate((segment) => {
      if (segment.stream !== activeStream) return false;
      const bufferRanges = QueueUtils.getLoadBufferRanges(
        this.playback,
        this.settings
      );
      return QueueUtils.isSegmentActual(segment, bufferRanges);
    });
    this.p2pLoaders = new P2PLoadersContainer(
      this.streamManifestUrl,
      requestedSegment.stream,
      this.requests,
      this.segmentStorage,
      this.settings
    );

    this.randomHttpDownloadInterval = window.setInterval(
      () => this.loadRandomThroughHttp(),
      1000
    );
  }

  // api method for engines
  async loadSegment(segment: Readonly<Segment>, callbacks: EngineCallbacks) {
    console.log("REQUESTED: ", getSegmentStringId(segment));
    const { stream } = segment;
    if (stream !== this.lastRequestedSegment.stream) {
      this.p2pLoaders.changeActiveLoader(stream);
    }
    this.lastRequestedSegment = segment;
    this.requests.addEngineCallbacks(segment, callbacks);
    this.processQueue();

    if (this.segmentStorage.hasSegment(segment)) {
      const data = await this.segmentStorage.getSegmentData(segment);
      if (data) {
        this.requests.resolveEngineRequest(segment, {
          data,
          bandwidth: this.bandwidthApproximator.getBandwidth(),
        });
      }
    }
  }

  private processQueue(force = true) {
    const now = performance.now();
    if (
      !force &&
      this.lastQueueProcessingTimeStamp !== undefined &&
      now - this.lastQueueProcessingTimeStamp <= 950
    ) {
      return;
    }
    this.lastQueueProcessingTimeStamp = now;

    const { queue, queueSegmentIds } = QueueUtils.generateQueue({
      lastRequestedSegment: this.lastRequestedSegment,
      playback: this.playback,
      settings: this.settings,
      skipSegment: (segment) => this.segmentStorage.hasSegment(segment),
    });

    this.requests.abortAllNotRequestedByEngine((segment) =>
      queueSegmentIds.has(segment.localId)
    );

    const { simultaneousHttpDownloads, simultaneousP2PDownloads } =
      this.settings;

    for (const item of queue) {
      const { statuses, segment } = item;
      // const timeToPlayback = getTimeToSegmentPlayback(segment, this.playback);
      if (statuses.isHighDemand) {
        if (this.requests.isHttpRequested(segment)) continue;
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
          void this.loadThroughHttp(item);
          continue;
        }

        this.abortLastHttpLoadingAfter(queue, segment);
        if (this.requests.httpRequestsCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(item);
          continue;
        }

        if (this.requests.isP2PRequested(segment)) continue;

        if (this.requests.p2pRequestsCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
          continue;
        }

        this.abortLastP2PLoadingAfter(queue, segment);
        if (this.requests.p2pRequestsCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
        }
        break;
      }
      if (statuses.isP2PDownloadable) {
        if (this.requests.isP2PRequested(segment)) continue;
        if (this.requests.p2pRequestsCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
          continue;
        }

        this.abortLastP2PLoadingAfter(queue, segment);
        if (this.requests.p2pRequestsCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
        }
      }
      break;
    }

    // console.log(
    //   [...this.requests.values()].map((req) => {
    //     const { loaderRequest, engineCallbacks, segment } = req;
    //
    //     return `${getSegmentStringId(segment)}-l${loaderRequest ? 1 : 0}-e${
    //       engineCallbacks ? 1 : 0
    //     }`;
    //   })
    // );
  }

  // api method for engines
  abortSegment(segmentId: string) {
    this.requests.abortEngineRequest(segmentId);
  }

  private async loadThroughHttp(item: QueueItem) {
    const { segment, statuses } = item;
    let data: ArrayBuffer | undefined;
    try {
      const idStr = getSegmentStringId(segment);
      console.log(`http requested: ${idStr} - ${getStatusesString(statuses)}`);
      const httpRequest = getHttpSegmentRequest(segment);
      this.requests.addLoaderRequest(segment, httpRequest);
      data = await httpRequest.promise;
      console.log(`=> http loaded: ${idStr}`);
      if (data) this.onSegmentLoaded(segment, data);
    } catch (err) {
      if (err instanceof FetchError) {
        // TODO: handle error
      }
    }
  }

  private async loadThroughP2P(item: QueueItem) {
    const { segment, statuses } = item;
    const p2pLoader = this.p2pLoaders.activeLoader;
    const idStr = getSegmentStringId(segment);
    try {
      const data = await p2pLoader.downloadSegment(segment);
      if (data) {
        console.log(`=> p2p loaded: ${idStr}, ${data?.byteLength}`);
        this.onSegmentLoaded(segment, data);
      }
    } catch (error) {
      console.log("");
      console.log(JSON.stringify(error));
      console.log("");
    }
  }

  private loadRandomThroughHttp() {
    const { simultaneousHttpDownloads } = this.settings;
    if (this.requests.httpRequestsCount >= simultaneousHttpDownloads) return;
    const p2pLoader = this.p2pLoaders.activeLoader;
    const { queue } = QueueUtils.generateQueue({
      lastRequestedSegment: this.lastRequestedSegment,
      playback: this.playback,
      settings: this.settings,
      skipSegment: (segment, statuses) =>
        !statuses.isHttpDownloadable ||
        this.segmentStorage.hasSegment(segment) ||
        this.requests.isHybridLoaderRequested(segment) ||
        p2pLoader.isLoadingOrLoadedBySomeone(segment),
    });
    if (!queue.length) return;

    const item = queue[Math.floor(Math.random() * queue.length)];
    console.log("HTTP RANDOM");
    // console.log("load random: ", getSegmentStringId(segment));
    void this.loadThroughHttp(item);
  }

  private onSegmentLoaded(segment: Segment, data: ArrayBuffer) {
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(segment, data);
    this.requests.resolveEngineRequest(segment, {
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
    this.processQueue();
  }

  private abortLastHttpLoadingAfter(queue: QueueItem[], segment: Segment) {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment.localId === segment.localId) break;
      if (this.requests.isHttpRequested(segment)) {
        this.requests.abortLoaderRequest(segment);
        console.log("aborted http: ", getSegmentStringId(segment));
        break;
      }
    }
  }

  private abortLastP2PLoadingAfter(queue: QueueItem[], segment: Segment) {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment.localId === segment.localId) break;
      if (this.requests.isP2PRequested(segment)) {
        this.requests.abortLoaderRequest(segment);
        console.log("aborted p2p: ", getSegmentStringId(segment));
        break;
      }
    }
  }

  updatePlayback(position: number, rate: number) {
    const isRateChanged = this.playback.rate !== rate;
    const isPositionChanged = this.playback.position !== position;

    if (!isRateChanged && !isPositionChanged) return;

    const isPositionSignificantlyChanged =
      Math.abs(position - this.playback.position) / this.segmentAvgDuration >
      0.5;

    if (isPositionChanged) this.playback.position = position;
    if (isRateChanged) this.playback.rate = rate;

    if (isPositionSignificantlyChanged) {
      console.log("\nposition: ", position);
    }
    void this.processQueue(isPositionSignificantlyChanged);
  }

  updateStream(stream: StreamWithSegments) {
    if (stream !== this.lastRequestedSegment.stream) return;
    console.log("STREAM UPDATED");
    this.processQueue();
  }

  destroy() {
    clearInterval(this.storageCleanUpIntervalId);
    clearInterval(this.randomHttpDownloadInterval);
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
      console.log("loader destroyed");
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

function getSegmentAvgDuration(stream: StreamWithSegments) {
  const { segments } = stream;
  let sumDuration = 0;
  const size = segments.size;
  for (const segment of segments.values()) {
    const duration = segment.endTime - segment.startTime;
    sumDuration += duration;
  }

  return sumDuration / size;
}

function getSegmentStringId(segment: Segment) {
  const { index } = segment.stream;
  const { externalId } = segment;
  return `${index}-${externalId}`;
}
