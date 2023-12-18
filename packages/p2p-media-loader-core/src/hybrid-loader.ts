import { Segment, StreamWithSegments } from "./index";
import { fulfillHttpSegmentRequest } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import { Settings, CoreEventHandlers, Playback } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { P2PLoadersContainer } from "./p2p/loaders-container";
import { RequestsContainer } from "./request-container";
import { EngineCallbacks } from "./request";
import * as QueueUtils from "./utils/queue";
import * as LoggerUtils from "./utils/logger";
import * as StreamUtils from "./utils/stream";
import * as Utils from "./utils/utils";
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
  private readonly logger: debug.Debugger;
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
    this.segmentAvgDuration = StreamUtils.getSegmentAvgDuration(activeStream);
    this.requests = new RequestsContainer(
      this.requestProcessQueueMicrotask,
      this.bandwidthApproximator,
      this.playback,
      this.settings
    );

    if (!this.segmentStorage.isInitialized) {
      throw new Error("Segment storage is not initialized.");
    }
    this.segmentStorage.addIsSegmentLockedPredicate((segment) => {
      if (segment.stream !== activeStream) return false;
      return StreamUtils.isSegmentActualInPlayback(
        segment,
        this.playback,
        this.settings
      );
    });
    this.p2pLoaders = new P2PLoadersContainer(
      this.streamManifestUrl,
      requestedSegment.stream,
      this.requests,
      this.segmentStorage,
      this.settings
    );

    this.logger = debug(`core:hybrid-loader-${activeStream.type}`);
    this.logger.color = "coral";

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
    this.logger(`requests: ${LoggerUtils.getSegmentString(segment)}`);
    const { stream } = segment;
    if (stream !== this.lastRequestedSegment.stream) {
      this.logger(`stream changed to ${LoggerUtils.getStreamString(stream)}`);
      this.p2pLoaders.changeCurrentLoader(stream);
    }
    this.lastRequestedSegment = segment;

    if (this.segmentStorage.hasSegment(segment)) {
      // TODO: error handling
      const data = await this.segmentStorage.getSegmentData(segment);
      if (data) {
        callbacks.onSuccess({
          data,
          bandwidth: this.bandwidthApproximator.getBandwidth(),
        });
      }
    } else {
      const request = this.requests.getOrCreateRequest(segment);
      request.setOrResolveEngineCallbacks(callbacks);
    }

    this.requestProcessQueueMicrotask();
  }

  private requestProcessQueueMicrotask = (force = true) => {
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
      try {
        this.processQueue();
        this.lastQueueProcessingTimeStamp = now;
      } finally {
        this.isProcessQueueMicrotaskCreated = false;
      }
    });
  };

  private processQueue() {
    const { queue, queueSegmentIds } = QueueUtils.generateQueue({
      lastRequestedSegment: this.lastRequestedSegment,
      playback: this.playback,
      settings: this.settings,
      skipSegment: (segment) => {
        return (
          this.requests.get(segment)?.status === "succeed" ||
          this.segmentStorage.hasSegment(segment)
        );
      },
    });

    for (const request of this.requests.items()) {
      if (request.status === "loading") {
        if (
          !request.isSegmentRequestedByEngine &&
          !queueSegmentIds.has(request.segment.localId)
        ) {
          request.abortFromProcessQueue();
          this.requests.remove(request);
        }
        continue;
      }

      if (request.status === "succeed") {
        const { type, data } = request;
        if (!type || !data) continue;
        if (type === "http") {
          this.p2pLoaders.currentLoader.broadcastAnnouncement();
        }
        void this.segmentStorage.storeSegment(request.segment, data);
        this.eventHandlers?.onSegmentLoaded?.(data.byteLength, type);
        this.requests.remove(request);
        continue;
      }

      if (request.status === "failed") {
        if (request.type === "http") {
          this.p2pLoaders.currentLoader.broadcastAnnouncement();
        }
        continue;
      }

      if (
        (request.status === "not-started" || request.status === "aborted") &&
        !request.isSegmentRequestedByEngine
      ) {
        this.requests.remove(request);
      }
    }

    const { simultaneousHttpDownloads, simultaneousP2PDownloads } =
      this.settings;

    for (const item of queue) {
      const { statuses, segment } = item;
      const request = this.requests.get(segment);

      if (statuses.isHighDemand) {
        if (request?.type === "http" && request.status === "loading") continue;

        if (this.requests.executingHttpCount < simultaneousHttpDownloads) {
          void this.loadThroughHttp(segment);
          continue;
        }

        if (
          this.abortLastHttpLoadingInQueueAfterItem(queue, segment) &&
          this.requests.executingHttpCount < simultaneousHttpDownloads
        ) {
          void this.loadThroughHttp(segment);
          continue;
        }

        if (request?.type === "p2p" && request.status === "loading") continue;

        if (this.requests.executingP2PCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(segment);
          continue;
        }

        if (
          this.abortLastP2PLoadingInQueueAfterItem(queue, segment) &&
          this.requests.executingP2PCount < simultaneousP2PDownloads
        ) {
          void this.loadThroughP2P(segment);
        }
        break;
      }
      if (statuses.isP2PDownloadable) {
        if (request?.status === "loading") continue;
        if (this.requests.executingP2PCount < simultaneousP2PDownloads) {
          void this.loadThroughP2P(segment);
          continue;
        }

        if (
          this.abortLastP2PLoadingInQueueAfterItem(queue, segment) &&
          this.requests.executingP2PCount < simultaneousP2PDownloads
        ) {
          void this.loadThroughP2P(segment);
        }
      }
      break;
    }
  }

  // api method for engines
  abortSegmentRequest(segmentLocalId: string) {
    const request = this.requests.getBySegmentLocalId(segmentLocalId);
    if (!request) return;
    request.abortFromEngine();
    this.logger("abort: ", LoggerUtils.getSegmentString(request.segment));
  }

  private async loadThroughHttp(segment: Segment) {
    const request = this.requests.getOrCreateRequest(segment);
    void fulfillHttpSegmentRequest(request, this.settings);
    this.p2pLoaders.currentLoader.broadcastAnnouncement();
  }

  private async loadThroughP2P(segment: Segment) {
    this.p2pLoaders.currentLoader.downloadSegment(segment);
  }

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
    const item = Utils.getRandomItem(queue);
    void this.loadThroughHttp(item.segment);
  }

  private abortLastHttpLoadingInQueueAfterItem(
    queue: QueueUtils.QueueItem[],
    segment: Segment
  ): boolean {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment === segment) break;
      const request = this.requests.get(itemSegment);
      if (request?.type === "http" && request.status === "loading") {
        request.abortFromProcessQueue();
        return true;
      }
    }
    return false;
  }

  private abortLastP2PLoadingInQueueAfterItem(
    queue: QueueUtils.QueueItem[],
    segment: Segment
  ): boolean {
    for (const { segment: itemSegment } of arrayBackwards(queue)) {
      if (itemSegment === segment) break;
      const request = this.requests.get(itemSegment);
      if (request?.type === "p2p" && request.status === "loading") {
        request.abortFromProcessQueue();
        return true;
      }
    }
    return false;
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
      this.logger("position significantly changed");
    }
    void this.requestProcessQueueMicrotask(isPositionSignificantlyChanged);
  }

  updateStream(stream: StreamWithSegments) {
    if (stream !== this.lastRequestedSegment.stream) return;
    this.logger(`update stream: ${LoggerUtils.getStreamString(stream)}`);
    this.requestProcessQueueMicrotask();
  }

  destroy() {
    clearInterval(this.storageCleanUpIntervalId);
    clearInterval(this.randomHttpDownloadInterval);
    this.storageCleanUpIntervalId = undefined;
    this.requests.destroy();
    this.p2pLoaders.destroy();
    this.logger.destroy();
  }
}

function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
  }
}
