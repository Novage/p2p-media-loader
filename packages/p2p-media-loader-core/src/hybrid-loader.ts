import { Segment, StreamWithSegments } from "./index";
import { HttpRequestExecutor } from "./http-loader";
import { SegmentsMemoryStorage } from "./segments-storage";
import {
  Settings,
  CoreEventHandlers,
  Playback,
  BandwidthCalculators,
} from "./types";
import { P2PLoadersContainer } from "./p2p/loaders-container";
import { RequestsContainer } from "./requests/request-container";
import { EngineRequest, EngineCallbacks } from "./requests/engine-request";
import * as QueueUtils from "./utils/queue";
import * as LoggerUtils from "./utils/logger";
import * as StreamUtils from "./utils/stream";
import * as Utils from "./utils/utils";
import debug from "debug";
import { QueueItem } from "./utils/queue";

const FAILED_ATTEMPTS_CLEAR_INTERVAL = 60000;

export class HybridLoader {
  private readonly requests: RequestsContainer;
  private readonly engineRequests = new Map<Segment, EngineRequest>();
  private readonly p2pLoaders: P2PLoadersContainer;
  private readonly playback: Playback;
  private readonly segmentAvgDuration: number;
  private readonly logger: debug.Debugger;
  private lastRequestedSegment: Readonly<Segment>;
  private storageCleanUpIntervalId?: number;
  private lastQueueProcessingTimeStamp?: number;
  private randomHttpDownloadInterval!: number;
  private isProcessQueueMicrotaskCreated = false;

  constructor(
    private streamManifestUrl: string,
    requestedSegment: Segment,
    private readonly settings: Settings,
    private readonly bandwidthCalculators: BandwidthCalculators,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly eventHandlers?: Pick<CoreEventHandlers, "onSegmentLoaded">
  ) {
    this.lastRequestedSegment = requestedSegment;
    const activeStream = requestedSegment.stream;
    this.playback = { position: requestedSegment.startTime, rate: 1 };
    this.segmentAvgDuration = StreamUtils.getSegmentAvgDuration(activeStream);
    this.requests = new RequestsContainer(
      this.requestProcessQueueMicrotask,
      this.bandwidthCalculators,
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

    const engineRequest = new EngineRequest(segment, callbacks);
    if (this.segmentStorage.hasSegment(segment)) {
      // TODO: error handling
      const data = await this.segmentStorage.getSegmentData(segment);
      if (data) {
        engineRequest.resolve(
          data,
          this.bandwidthCalculators.all.getBandwidthForLastNSplicedSeconds(3)
        );
      }
    } else {
      this.engineRequests.set(segment, engineRequest);
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

  private processRequests(queueSegmentIds: Set<string>) {
    const { stream } = this.lastRequestedSegment;
    const { httpErrorRetries } = this.settings;
    const now = performance.now();
    for (const request of this.requests.items()) {
      const { type, status, segment, isHandledByProcessQueue } = request;
      const engineRequest = this.engineRequests.get(segment);

      switch (status) {
        case "loading":
          if (!queueSegmentIds.has(segment.localId) && !engineRequest) {
            request.abortFromProcessQueue();
            this.requests.remove(request);
          }
          break;

        case "succeed":
          if (!request.data || !type) break;
          if (type === "http") {
            this.p2pLoaders.currentLoader.broadcastAnnouncement();
          }
          engineRequest?.resolve(
            request.data,
            this.bandwidthCalculators.all.getBandwidthForLastNSeconds(3)
          );
          this.engineRequests.delete(segment);
          this.requests.remove(request);
          void this.segmentStorage.storeSegment(request.segment, request.data);
          this.eventHandlers?.onSegmentLoaded?.(request.data.byteLength, type);
          break;

        case "failed":
          if (type === "http" && !isHandledByProcessQueue) {
            this.p2pLoaders.currentLoader.broadcastAnnouncement();
          }
          if (!engineRequest && !stream.segments.has(request.segment.localId)) {
            this.requests.remove(request);
          }
          if (
            request.failedAttempts.httpAttemptsCount >= httpErrorRetries &&
            engineRequest
          ) {
            engineRequest.reject();
            this.engineRequests.delete(segment);
          }
          break;

        case "not-started":
          this.requests.remove(request);
          break;

        case "aborted":
          this.requests.remove(request);
          break;
      }

      request.markHandledByProcessQueue();
      const { lastAttempt } = request.failedAttempts;
      if (
        lastAttempt &&
        now - lastAttempt.error.timestamp > FAILED_ATTEMPTS_CLEAR_INTERVAL
      ) {
        request.failedAttempts.clear();
      }
    }
  }

  private processQueue() {
    const { queue, queueSegmentIds } = this.generateQueue();
    this.processRequests(queueSegmentIds);

    const {
      simultaneousHttpDownloads,
      simultaneousP2PDownloads,
      httpErrorRetries,
    } = this.settings;

    for (const item of queue) {
      const { statuses, segment } = item;
      const request = this.requests.get(segment);

      if (statuses.isHighDemand) {
        if (request?.type === "http" && request.status === "loading") continue;
        if (
          request?.type === "http" &&
          request.status === "failed" &&
          request.failedAttempts.httpAttemptsCount >= httpErrorRetries
        ) {
          break;
        }

        const isP2PLoadingRequest =
          request?.status === "loading" && request.type === "p2p";

        if (this.requests.executingHttpCount < simultaneousHttpDownloads) {
          if (isP2PLoadingRequest) request.abortFromProcessQueue();
          void this.loadThroughHttp(segment);
          continue;
        }

        if (
          this.abortLastHttpLoadingInQueueAfterItem(queue, segment) &&
          this.requests.executingHttpCount < simultaneousHttpDownloads
        ) {
          if (isP2PLoadingRequest) request.abortFromProcessQueue();
          void this.loadThroughHttp(segment);
          continue;
        }

        if (isP2PLoadingRequest) continue;

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
    for (const engineRequest of this.engineRequests.values()) {
      if (segmentLocalId === engineRequest.segment.localId) {
        engineRequest.abort();
        this.engineRequests.delete(engineRequest.segment);
        this.logger(
          "abort: ",
          LoggerUtils.getSegmentString(engineRequest.segment)
        );
        break;
      }
    }
  }

  private async loadThroughHttp(segment: Segment) {
    const request = this.requests.getOrCreateRequest(segment);
    new HttpRequestExecutor(request, this.settings);
    this.p2pLoaders.currentLoader.broadcastAnnouncement();
  }

  private async loadThroughP2P(segment: Segment) {
    this.p2pLoaders.currentLoader.downloadSegment(segment);
  }

  private loadRandomThroughHttp() {
    const { simultaneousHttpDownloads, httpErrorRetries } = this.settings;
    const p2pLoader = this.p2pLoaders.currentLoader;
    const connectedPeersAmount = p2pLoader.connectedPeersAmount;

    if (
      this.requests.executingHttpCount >= simultaneousHttpDownloads ||
      !connectedPeersAmount
    ) {
      return;
    }

    const segmentsToLoad: Segment[] = [];
    for (const { segment, statuses } of QueueUtils.generateQueue(
      this.lastRequestedSegment,
      this.playback,
      this.settings
    )) {
      if (
        !statuses.isHttpDownloadable ||
        p2pLoader.isLoadingOrLoadedBySomeone(segment) ||
        this.segmentStorage.hasSegment(segment)
      ) {
        continue;
      }
      const request = this.requests.get(segment);
      if (
        request &&
        (request.status === "succeed" ||
          (request.failedAttempts.httpAttemptsCount ?? 0) >= httpErrorRetries)
      ) {
        continue;
      }
      segmentsToLoad.push(segment);
    }

    if (!segmentsToLoad.length) return;
    const peersAmount = connectedPeersAmount + 1;
    const probability = Math.min(segmentsToLoad.length / peersAmount, 1);
    const shouldLoad = Math.random() < probability;

    if (!shouldLoad) return;
    const segment = Utils.getRandomItem(segmentsToLoad);
    void this.loadThroughHttp(segment);
  }

  private abortLastHttpLoadingInQueueAfterItem(
    queue: QueueUtils.QueueItem[],
    segment: Segment
  ): boolean {
    for (const { segment: itemSegment } of Utils.arrayBackwards(queue)) {
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
    for (const { segment: itemSegment } of Utils.arrayBackwards(queue)) {
      if (itemSegment === segment) break;
      const request = this.requests.get(itemSegment);
      if (request?.type === "p2p" && request.status === "loading") {
        request.abortFromProcessQueue();
        return true;
      }
    }
    return false;
  }

  private generateQueue() {
    const queue: QueueItem[] = [];
    const queueSegmentIds = new Set<string>();
    let maxPossibleLength = 0;
    let alreadyLoadedAmount = 0;
    for (const item of QueueUtils.generateQueue(
      this.lastRequestedSegment,
      this.playback,
      this.settings
    )) {
      maxPossibleLength++;
      const { segment } = item;
      if (
        this.segmentStorage.hasSegment(segment) ||
        this.requests.get(segment)?.status === "succeed"
      ) {
        alreadyLoadedAmount++;
        continue;
      }
      queue.push(item);
      queueSegmentIds.add(segment.localId);
    }

    return {
      queue,
      queueSegmentIds,
      maxPossibleLength,
      alreadyLoadedAmount,
      loadedPercent: (alreadyLoadedAmount / maxPossibleLength) * 100,
    };
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
