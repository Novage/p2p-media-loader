import { Segment, StreamWithSegments } from "./index";
import { fulfillHttpSegmentRequest } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings, CoreEventHandlers } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Playback, QueueItem } from "./internal-types";
import {
  RequestsContainer,
  EngineCallbacks,
  HybridLoaderRequest,
  Request,
} from "./request-container";
import * as QueueUtils from "./utils/queue";
import * as LoggerUtils from "./utils/logger";
import { P2PLoadersContainer } from "./p2p/loaders-container";
import { PeerRequestError } from "./p2p/peer";
import debug from "debug";

export class HybridLoader {
  private readonly requests: RequestsContainer;
  private readonly p2pLoaders: P2PLoadersContainer;
  private storageCleanUpIntervalId?: number;
  private lastRequestedSegment: Readonly<Segment>;
  private readonly playback: Playback;
  private lastQueueProcessingTimeStamp?: number;
  private readonly segmentAvgDuration: number;
  private randomHttpDownloadInterval!: number;
  private readonly logger: { engine: debug.Debugger; loader: debug.Debugger };
  private readonly levelBandwidth = { value: 0, refreshCount: 0 };
  private isProcessQueueMicrotaskCreated = false;

  constructor(
    private streamManifestUrl: string,
    requestedSegment: Segment,
    private readonly settings: Settings,
    private readonly bandwidthApproximator: BandwidthApproximator,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly eventHandlers?: Pick<CoreEventHandlers, "onSegmentLoaded">
  ) {
    this.lastRequestedSegment = requestedSegment;
    const activeStream = requestedSegment.stream;
    this.playback = { position: requestedSegment.startTime, rate: 1 };
    this.segmentAvgDuration = getSegmentAvgDuration(activeStream);
    this.requests = new RequestsContainer(
      requestedSegment.stream.type,
      this.bandwidthApproximator
    );

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

    const loader = debug(`core:hybrid-loader-${activeStream.type}`);
    const engine = debug(`core:hybrid-loader-${activeStream.type}-engine`);
    loader.color = "coral";
    engine.color = "orange";
    this.logger = { loader, engine };

    this.setIntervalLoading();
  }

  private setIntervalLoading() {
    const randomTimeout = (Math.random() * 2 + 1) * 1000;
    this.randomHttpDownloadInterval = window.setTimeout(() => {
      this.loadRandomThroughHttp();
      this.setIntervalLoading();
    }, randomTimeout);
  }

  // api method for engines
  async loadSegment(segment: Readonly<Segment>, callbacks: EngineCallbacks) {
    this.logger.engine(`requests: ${LoggerUtils.getSegmentString(segment)}`);
    const { stream } = segment;
    if (stream !== this.lastRequestedSegment.stream) {
      this.logger.engine(
        `stream changed to ${LoggerUtils.getStreamString(stream)}`
      );
      this.p2pLoaders.changeCurrentLoader(stream);
      this.refreshLevelBandwidth(true);
    }
    this.lastRequestedSegment = segment;

    if (this.segmentStorage.hasSegment(segment)) {
      // TODO: error handling
      const data = await this.segmentStorage.getSegmentData(segment);
      if (data) {
        callbacks.onSuccess({
          data,
          bandwidth: this.levelBandwidth.value,
        });
      }
    } else {
      const request = this.requests.getOrCreateRequest(segment);
      request.engineCallbacks = callbacks;
    }

    this.createProcessQueueMicrotask();
  }

  private createProcessQueueMicrotask(force = true) {
    const now = performance.now();
    if (
      (!force &&
        this.lastQueueProcessingTimeStamp !== undefined &&
        now - this.lastQueueProcessingTimeStamp <= 1000) ||
      this.isProcessQueueMicrotaskCreated
    ) {
      return;
    }

    this.isProcessQueueMicrotaskCreated = true;
    queueMicrotask(() => {
      this.processQueue();
      this.lastQueueProcessingTimeStamp = now;
      this.isProcessQueueMicrotaskCreated = false;
    });
  }

  private processQueue() {
    const { queue, queueSegmentIds } = QueueUtils.generateQueue({
      lastRequestedSegment: this.lastRequestedSegment,
      playback: this.playback,
      settings: this.settings,
      skipSegment: (segment) => this.segmentStorage.hasSegment(segment),
    });

    for (const request of this.requests.values()) {
      if (
        !request.isSegmentRequestedByEngine &&
        request.status === "loading" &&
        !queueSegmentIds.has(request.segment.localId)
      ) {
        request.abort();
        this.requests.remove(request);
      }
    }

    const { simultaneousHttpDownloads, simultaneousP2PDownloads } =
      this.settings;

    for (const item of queue) {
      const { statuses, segment } = item;
      const request = this.requests.get(segment);

      if (statuses.isHighDemand) {
        if (request?.type === "http") continue;

        if (request?.type === "p2p") {
          const timeToPlayback = getTimeToSegmentPlayback(
            segment,
            this.playback
          );
          const remainingDownloadTime =
            getPredictedRemainingDownloadTime(request);
          if (
            remainingDownloadTime === undefined ||
            remainingDownloadTime > timeToPlayback
          ) {
            request.abort();
          } else {
            continue;
          }
        }
        if (this.requests.executingHttpCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(item);
          continue;
        }

        this.abortLastHttpLoadingAfter(queue, segment);
        if (this.requests.executingHttpCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(item);
          continue;
        }

        if (this.requests.isP2PRequested(segment)) continue;

        if (this.requests.executingP2PCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
          continue;
        }

        this.abortLastP2PLoadingAfter(queue, segment);
        if (this.requests.executingP2PCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
        }
        break;
      }
      if (statuses.isP2PDownloadable) {
        if (request) continue;
        if (this.requests.executingP2PCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
          continue;
        }

        this.abortLastP2PLoadingAfter(queue, segment);
        if (this.requests.executingP2PCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(item);
        }
      }
      break;
    }
  }

  // api method for engines
  abortSegment(segment: Segment) {
    this.logger.engine("abort: ", LoggerUtils.getSegmentString(segment));
    this.requests.abortEngineRequest(segment);
  }

  private async loadThroughHttp(item: QueueItem, isRandom = false) {
    const { segment } = item;

    const request = this.requests.getOrCreateRequest(segment);
    request.subscribe("onCompleted", this.onRequestCompleted);
    request.subscribe("onError", this.onRequestError);

    void fulfillHttpSegmentRequest(request, this.settings);
    if (!isRandom) {
      this.logger.loader(
        `http request: ${LoggerUtils.getQueueItemString(item)}`
      );
    }
  }

  private async loadThroughP2P(item: QueueItem) {
    const p2pLoader = this.p2pLoaders.currentLoader;
    const request = p2pLoader.downloadSegment(item);
    if (request === undefined) return;

    request.subscribe("onCompleted", this.onRequestCompleted);
    request.subscribe("onError", this.onRequestError);
  }

  private onRequestCompleted = (request: Request, data: ArrayBuffer) => {
    const { segment } = request;
    this.logger.loader(`http responses: ${segment.externalId}`);
    this.eventHandlers?.onSegmentLoaded?.(data.byteLength, "http");
    this.createProcessQueueMicrotask();
  };

  private onRequestError = (request: Request, error: Error) => {
    if (!(error instanceof PeerRequestError) || error.type === "manual-abort") {
      return;
    }
    this.createProcessQueueMicrotask();
  };

  private loadRandomThroughHttp() {
    const { simultaneousHttpDownloads } = this.settings;
    const p2pLoader = this.p2pLoaders.currentLoader;
    const connectedPeersAmount = p2pLoader.connectedPeersAmount;
    if (
      this.requests.executingHttpCount >= simultaneousHttpDownloads ||
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
    const probability = Math.min(queue.length / peersAmount, 1);
    const shouldLoad = Math.random() < probability;

    if (!shouldLoad) return;
    const item = queue[Math.floor(Math.random() * queue.length)];
    void this.loadThroughHttp(item, true);

    this.logger.loader(
      `http random request: ${LoggerUtils.getQueueItemString(item)}`
    );
  }

  private onSegmentLoaded(
    queueItem: QueueItem,
    type: HybridLoaderRequest["type"],
    data: ArrayBuffer
  ) {
    const { segment, statuses } = queueItem;
    const byteLength = data.byteLength;
    if (type === "http" && statuses.isHighDemand) {
      this.refreshLevelBandwidth(true);
    }
    void this.segmentStorage.storeSegment(segment, data);
    this.eventHandlers?.onSegmentLoaded?.(byteLength, type);
    this.createProcessQueueMicrotask();
  }

  private abortLastHttpLoadingAfter(queue: QueueItem[], segment: Segment) {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment.localId === segment.localId) break;
      if (this.requests.isHttpRequested(segment)) {
        this.requests.get(segment)?.abort();
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
        this.requests.get(segment)?.abort();
        this.logger.loader(
          "p2p aborted: ",
          LoggerUtils.getSegmentString(segment)
        );
        break;
      }
    }
  }

  private refreshLevelBandwidth(levelChanged = false) {
    if (levelChanged) this.levelBandwidth.refreshCount = 0;
    if (this.levelBandwidth.refreshCount < 3) {
      const currentBandwidth = this.bandwidthApproximator.getBandwidth();
      this.levelBandwidth.value = currentBandwidth ?? 0;
      this.levelBandwidth.refreshCount++;
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
    if (isRateChanged && rate !== 0) this.playback.rate = rate;
    if (isPositionSignificantlyChanged) {
      this.logger.engine("position significantly changed");
    }
    void this.createProcessQueueMicrotask(isPositionSignificantlyChanged);
  }

  updateStream(stream: StreamWithSegments) {
    if (stream !== this.lastRequestedSegment.stream) return;
    this.logger.engine(`update stream: ${LoggerUtils.getStreamString(stream)}`);
    this.createProcessQueueMicrotask();
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

function getTimeToSegmentPlayback(segment: Segment, playback: Playback) {
  return Math.max(segment.startTime - playback.position, 0) / playback.rate;
}

function getPredictedRemainingDownloadTime(request: HybridLoaderRequest) {
  const { progress } = request;
  if (!progress || progress.lastLoadedChunkTimestamp === undefined) {
    return undefined;
  }

  const now = performance.now();
  const bandwidth =
    progress.percent /
    (progress.lastLoadedChunkTimestamp - progress.startTimestamp);
  const remainingDownloadPercent = 100 - progress.percent;
  const predictedRemainingTimeFromLastDownload =
    remainingDownloadPercent / bandwidth;
  const timeFromLastDownload = now - progress.lastLoadedChunkTimestamp;
  return (predictedRemainingTimeFromLastDownload - timeFromLastDownload) / 1000;
}

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
