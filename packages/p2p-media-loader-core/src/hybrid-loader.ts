import { Segment, StreamWithSegments } from "./index";
import { getHttpSegmentRequest } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings, CoreEventHandlers } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import { RequestContainer, EngineCallbacks } from "./request";
import * as QueueUtils from "./utils/queue-utils";
import * as LoggerUtils from "./utils/logger";
import { FetchError } from "./errors";
import { P2PLoadersContainer } from "./p2p-loaders-container";
import debug from "debug";

export class HybridLoader {
  private readonly requests = new RequestContainer();
  private readonly p2pLoaders: P2PLoadersContainer;
  private storageCleanUpIntervalId?: number;
  private lastRequestedSegment: Readonly<Segment>;
  private readonly playback: Playback;
  private lastQueueProcessingTimeStamp?: number;
  private readonly segmentAvgDuration: number;
  private readonly randomHttpDownloadInterval: number;
  private readonly logger: { engine: debug.Debugger; loader: debug.Debugger };

  constructor(
    private streamManifestUrl: string,
    requestedSegment: Segment,
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly eventHandlers?: Pick<CoreEventHandlers, "onDataLoaded">
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

    this.logger = {
      loader: debug(`core:${activeStream.type}-hybrid-loader`),
      engine: debug(`core:${activeStream.type}-hybrid-loader-engine`),
    };

    this.randomHttpDownloadInterval = window.setInterval(
      this.loadRandomThroughHttp.bind(this),
      1500
    );
  }

  // api method for engines
  async loadSegment(segment: Readonly<Segment>, callbacks: EngineCallbacks) {
    this.logger.engine(`requests: ${LoggerUtils.getSegmentString(segment)}`);
    const { stream } = segment;
    if (stream !== this.lastRequestedSegment.stream) {
      this.logger.loader(
        `STREAM CHANGED ${LoggerUtils.getStreamString(stream)}`
      );
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
  abortSegment(segment: Segment) {
    this.logger.engine("abort: ", LoggerUtils.getSegmentString(segment));
    this.requests.abortEngineRequest(segment);
  }

  private async loadThroughHttp(item: QueueItem, isRandom = false) {
    const { segment } = item;
    let data: ArrayBuffer | undefined;
    try {
      const httpRequest = getHttpSegmentRequest(segment);

      if (!isRandom) {
        this.logger.loader(
          `http request: ${LoggerUtils.getQueueItemString(item)}`
        );
      }

      this.requests.addLoaderRequest(segment, httpRequest);
      data = await httpRequest.promise;

      this.logger.loader(`http responses: ${segment.externalId}`);
      if (data) this.onSegmentLoaded(segment, data, "http");
    } catch (err) {
      if (err instanceof FetchError) {
        // TODO: handle error
      }
    }
  }

  private async loadThroughP2P(item: QueueItem) {
    const { segment, statuses } = item;
    const p2pLoader = this.p2pLoaders.activeLoader;
    try {
      const segmentString = LoggerUtils.getSegmentString(segment);
      const statusesStr = LoggerUtils.getStatusesString(statuses);
      const data = await p2pLoader.downloadSegment(segment);
      if (data) {
        this.logger.loader(`p2p loaded: ${segmentString} | ${statusesStr}`);
        this.onSegmentLoaded(segment, data, "p2p");
      }
    } catch (error) {
      console.log("");
      console.log(JSON.stringify(error));
      console.log("");
    }
  }

  private loadRandomThroughHttp() {
    const { simultaneousHttpDownloads } = this.settings;
    const p2pLoader = this.p2pLoaders.activeLoader;
    const connectedPeersAmount = p2pLoader.connectedPeersAmount;
    if (
      this.requests.httpRequestsCount >= simultaneousHttpDownloads ||
      !connectedPeersAmount
    ) {
      return;
    }
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
    const peersAmount = connectedPeersAmount + 1;
    const probability = Math.min(queue.length / peersAmount, 1) / 2;
    const shouldLoad = Math.random() < probability;

    if (!shouldLoad) return;
    const item = queue[Math.floor(Math.random() * queue.length)];
    void this.loadThroughHttp(item, true);

    this.logger.loader(
      `http random request: ${LoggerUtils.getQueueItemString(item)}`
    );
  }

  private onSegmentLoaded(
    segment: Segment,
    data: ArrayBuffer,
    type: "http" | "p2p"
  ) {
    const byteLength = data.byteLength;
    this.bandwidthApproximator.addBytes(data.byteLength);
    void this.segmentStorage.storeSegment(segment, data);
    this.requests.resolveEngineRequest(segment, {
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
    this.eventHandlers?.onDataLoaded?.(byteLength, type);
    this.processQueue();
  }

  private abortLastHttpLoadingAfter(queue: QueueItem[], segment: Segment) {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment.localId === segment.localId) break;
      if (this.requests.isHttpRequested(segment)) {
        this.requests.abortLoaderRequest(segment);
        this.logger.loader(
          "http aborted: ",
          LoggerUtils.getSegmentString(segment)
        );
        break;
      }
    }
  }

  private abortLastP2PLoadingAfter(queue: QueueItem[], segment: Segment) {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment.localId === segment.localId) break;
      if (this.requests.isP2PRequested(segment)) {
        this.requests.abortLoaderRequest(segment);
        this.logger.loader(
          "p2p aborted: ",
          LoggerUtils.getSegmentString(segment)
        );
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
      this.logger.engine("position significantly changed");
    }
    void this.processQueue(isPositionSignificantlyChanged);
  }

  updateStream(stream: StreamWithSegments) {
    if (stream !== this.lastRequestedSegment.stream) return;
    this.logger.engine(`update stream: ${LoggerUtils.getStreamString(stream)}`);
    this.processQueue();
  }

  destroy() {
    clearInterval(this.storageCleanUpIntervalId);
    clearInterval(this.randomHttpDownloadInterval);
    this.storageCleanUpIntervalId = undefined;
    void this.segmentStorage.destroy();
    this.requests.destroy();
    this.p2pLoaders.destroy();
    this.logger.loader.destroy();
    this.logger.engine.destroy();
  }
}

function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
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
