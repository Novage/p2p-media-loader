import { HttpRequestExecutor } from "./http-loader.js";
import { CoreEventMap, DownloadSource, StreamConfig } from "./types.js";
import {
  Playback,
  BandwidthCalculators,
  EngineCallbacks,
  StreamDetails,
  SegmentWithStream,
  StreamWithSegments,
} from "./internal-types.js";
import { P2PLoadersContainer } from "./p2p/loaders-container.js";
import { RequestsContainer } from "./requests/request-container.js";
import { EngineRequest } from "./requests/engine-request.js";
import * as QueueUtils from "./utils/queue.js";
import * as LoggerUtils from "./utils/logger.js";
import * as Utils from "./utils/utils.js";
import * as ElectionUtils from "./utils/election.js";
import { getDistanceFromPlayhead } from "./utils/stream.js";
import debug from "debug";
import { QueueItem } from "./utils/queue.js";
import { EventTarget } from "./utils/event-target.js";
import { SegmentStorage } from "./segment-storage/index.js";
import { WebTorrentSocketPool } from "./webtorrent/webtorrent-socket-pool/index.js";
import { PlaybackTracker } from "./playback-tracker.js";
import type { PlaybackState } from "./playback.js";

const FAILED_ATTEMPTS_CLEAR_INTERVAL = 60000;
const PEER_UPDATE_LATENCY = 1000;
/** Weight of the newest sample in the running estimate of a stream's segment size. */
const SEGMENT_BYTES_EWMA_ALPHA = 0.3;

export class HybridLoader {
  private readonly requests: RequestsContainer;
  private engineRequest?: EngineRequest;
  private readonly p2pLoaders: P2PLoadersContainer;
  private readonly playback: Playback;
  private readonly playbackTracker: PlaybackTracker;
  private readonly logger: debug.Debugger;
  // Diagnostic only. While segment times still come from the player, the
  // estimate below must match media.currentTime; the engines log that value in
  // the same namespace. Enable with localStorage.debug = "p2pml:playback-oracle".
  private readonly oracleLogger = debug("p2pml:playback-oracle");
  private levelChangedTimestamp?: number;
  private lastQueueProcessingTimeStamp?: number;
  private randomHttpDownloadTimeout?: number;
  /** Running estimate of segment size per stream, from segments already loaded. */
  private readonly segmentBytesByStream = new Map<string, number>();
  private initialHttpDelayTimeoutId?: number;
  private isProcessQueueMicrotaskCreated = false;
  private readonly createdAt = performance.now();

  constructor(
    private lastRequestedSegment: Readonly<SegmentWithStream>,
    private readonly streamDetails: Required<Readonly<StreamDetails>>,
    private readonly config: StreamConfig,
    private readonly bandwidthCalculators: BandwidthCalculators,
    private readonly segmentStorage: SegmentStorage,
    private readonly webTorrentSocketPool: WebTorrentSocketPool,
    private readonly eventTarget: EventTarget<CoreEventMap>,
    private readonly peerId: string,
  ) {
    const activeStream = this.lastRequestedSegment.stream;
    this.playbackTracker = new PlaybackTracker(this.lastRequestedSegment);
    // Shared by reference with the requests container; kept current by
    // syncPlayback() rather than replaced.
    this.playback = this.playbackTracker.getPlayback();
    this.requests = new RequestsContainer(
      this.requestProcessQueueMicrotask,
      this.bandwidthCalculators,
      this.playback,
      this.config,
      this.eventTarget,
    );

    this.p2pLoaders = new P2PLoadersContainer(
      this.lastRequestedSegment.stream,
      this.requests,
      this.segmentStorage,
      this.config,
      this.webTorrentSocketPool,
      this.eventTarget,
      this.peerId,
      this.requestProcessQueueMicrotask,
    );

    this.logger = debug(`p2pml-core:hybrid-loader-${activeStream.type}`);
    this.logger.color = "coral";

    this.setIntervalLoading();
  }

  private setIntervalLoading() {
    const peersCount = this.p2pLoaders.currentLoader.connectedPeerCount;
    const randomTimeout =
      Math.random() * PEER_UPDATE_LATENCY * peersCount + PEER_UPDATE_LATENCY;
    this.randomHttpDownloadTimeout = window.setTimeout(() => {
      // Deadlines pass without any queue event, so re-check on a timer too.
      this.prefetchThroughHttp();
      this.setIntervalLoading();
    }, randomTimeout);
  }

  // api method for engines
  async loadSegment(
    segment: Readonly<SegmentWithStream>,
    callbacks: EngineCallbacks,
  ) {
    this.logger(`requests: ${LoggerUtils.getSegmentString(segment)}`);
    const { stream } = segment;
    if (stream !== this.lastRequestedSegment.stream) {
      this.logger(`stream changed to ${LoggerUtils.getStreamString(stream)}`);
      this.p2pLoaders.changeCurrentLoader(stream);
      // The active rendition follows from the requested segment; bandwidth
      // measured before the switch says nothing about the new one.
      this.levelChangedTimestamp = performance.now();
    }
    this.lastRequestedSegment = segment;
    const isSeek = this.playbackTracker.onSegmentRequested(segment);
    this.syncPlayback();
    if (isSeek) this.logger("seek detected: buffer edge re-anchored");

    this.segmentStorage.onSegmentRequested(
      stream.swarmId,
      stream.streamSwarmId,
      segment.externalId,
      segment.startTime,
      segment.endTime,
      stream.type,
      this.streamDetails.isLive,
    );
    const engineRequest = new EngineRequest(segment, callbacks);
    // After a seek the player has nothing buffered at the new position; do not
    // wait for peers before starting this request.
    if (isSeek) engineRequest.markAsShouldBeStartedImmediately();

    try {
      const hasSegment = this.segmentStorage.hasSegment(
        stream.swarmId,
        stream.streamSwarmId,
        segment.externalId,
      );

      if (hasSegment) {
        const data = await this.segmentStorage.getSegmentData(
          stream.swarmId,
          stream.streamSwarmId,
          segment.externalId,
        );
        // Byte length as well as presence: a stored segment that reads back
        // empty is a storage that let its buffer be detached, and serving it
        // would hand the player nothing while looking like a hit. Load it
        // again instead — at once, because the queue still counts the segment
        // as held and would leave this request waiting on nothing — and say so
        // loudly enough to be found.
        if (data?.byteLength === 0) {
          this.logger(
            `storage returned an empty segment for ${LoggerUtils.getSegmentString(segment)}; loading it again`,
          );
          engineRequest.markAsShouldBeStartedImmediately();
        }

        if (data && data.byteLength > 0) {
          const { queueDownloadRatio } = this.generateQueue();
          engineRequest.resolve(data, this.getBandwidth(queueDownloadRatio));
          this.playbackTracker.onSegmentDelivered(segment);
          this.syncPlayback();
          return;
        }
      }

      this.engineRequest?.abort();
      this.engineRequest = engineRequest;

      // If the engine explicitly requests a segment that previously failed during
      // background pre-fetching, clear its error history so it can be retried.
      const request = this.requests.get(segment);
      if (request?.status === "failed") {
        request.failedAttempts.clear();
      }
    } catch (error) {
      this.logger(
        `request failed for ${LoggerUtils.getSegmentString(segment)} in ${LoggerUtils.getStreamString(stream)}`,
        error,
      );
      engineRequest.reject();
    } finally {
      this.requestProcessQueueMicrotask();
    }
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
    Utils.queueMicrotask(() => {
      try {
        this.processQueue();
        this.lastQueueProcessingTimeStamp = now;
      } finally {
        this.isProcessQueueMicrotaskCreated = false;
      }
    });
  };

  private processRequests(
    queueSegmentIds: Set<string>,
    queueDownloadRatio: number,
  ) {
    const { stream } = this.lastRequestedSegment;
    const { httpErrorRetries } = this.config;
    const now = performance.now();
    for (const request of this.requests.items()) {
      const {
        downloadSource: type,
        status,
        segment,
        isHandledByProcessQueue,
      } = request;
      const engineRequest =
        this.engineRequest?.segment === segment
          ? this.engineRequest
          : undefined;

      switch (status) {
        case "loading":
          if (!queueSegmentIds.has(segment.runtimeId) && !engineRequest) {
            request.cancel();
            this.requests.remove(request);
          }
          break;

        case "succeed": {
          if (!type) break;
          if (type === "http") {
            this.p2pLoaders.currentLoader.broadcastAnnouncement();
          }
          if (engineRequest) {
            engineRequest.resolve(
              request.data,
              this.getBandwidth(queueDownloadRatio),
            );
            this.engineRequest = undefined;
            // The buffer edge tracks what the player holds. Only an engine
            // request delivers to the player; a background prefetch fills the
            // store and leaves the player's buffer where it was.
            this.playbackTracker.onSegmentDelivered(segment);
            this.syncPlayback();
          }
          this.requests.remove(request);
          this.noteSegmentBytes(segment, request.data.byteLength);

          this.logger(
            `succeed: ${LoggerUtils.getSegmentString(segment)} (byteLength: ${request.data.byteLength})`,
          );

          void this.segmentStorage.storeSegment(
            stream.swarmId,
            stream.streamSwarmId,
            segment.externalId,
            request.data,
            segment.startTime,
            segment.endTime,
            segment.stream.type,
            this.streamDetails.isLive,
          );
          break;
        }

        case "failed":
          if (type === "http" && !isHandledByProcessQueue) {
            this.p2pLoaders.currentLoader.broadcastAnnouncement();
          }
          if (
            !engineRequest &&
            !stream.segments.has(request.segment.runtimeId)
          ) {
            this.requests.remove(request);
          }
          if (
            request.failedAttempts.httpAttemptsCount >= httpErrorRetries &&
            engineRequest
          ) {
            this.engineRequest = undefined;
            engineRequest.reject();
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
    const { queue, queueSegmentIds, queueDownloadRatio } = this.generateQueue();
    this.processRequests(queueSegmentIds, queueDownloadRatio);

    const {
      simultaneousHttpDownloads,
      simultaneousP2PDownloads,
      httpErrorRetries,
      httpDownloadInitialTimeoutMs,
    } = this.config;

    const timeSinceStart = performance.now() - this.createdAt;
    const isInitialHttpWait =
      httpDownloadInitialTimeoutMs > 0 &&
      timeSinceStart < httpDownloadInitialTimeoutMs;

    if (isInitialHttpWait) {
      this.initialHttpDelayTimeoutId ??= window.setTimeout(() => {
        this.initialHttpDelayTimeoutId = undefined;
        this.requestProcessQueueMicrotask();
      }, httpDownloadInitialTimeoutMs - timeSinceStart);
    }

    const { engineRequest } = this;
    if (engineRequest) {
      const { segment } = engineRequest;
      const request = this.requests.get(segment);

      const shouldStartLoadImmediatelyEngineRequest =
        engineRequest.shouldBeStartedImmediately &&
        engineRequest.status === "pending" &&
        (!request ||
          request.status === "not-started" ||
          request.status === "failed" ||
          request.status === "aborted");

      if (shouldStartLoadImmediatelyEngineRequest) {
        // Don't abort requests when processing engine request
        // to avoid race condition with aborts in the requests queue

        const canLoadThroughHttp =
          !isInitialHttpWait &&
          (request?.failedAttempts.httpAttemptsCount ?? 0) < httpErrorRetries &&
          this.requests.executingHttpCount < simultaneousHttpDownloads;

        if (canLoadThroughHttp) {
          this.loadThroughHttp(segment);
        } else {
          const canLoadThroughP2P =
            this.p2pLoaders.currentLoader.isSegmentLoadedBySomeone(segment) &&
            this.requests.executingP2PCount < simultaneousP2PDownloads;

          if (canLoadThroughP2P) {
            this.loadThroughP2P(segment);
          }
        }
      }
    }

    for (const item of queue) {
      const { statuses, segment } = item;
      const request = this.requests.get(segment);

      if (request?.status === "succeed") continue;

      if (statuses.isHighDemand) {
        const canLoadThroughHttp =
          !isInitialHttpWait &&
          (request?.failedAttempts.httpAttemptsCount ?? 0) < httpErrorRetries;

        if (request?.status === "loading") {
          // High-demand request is loading

          const shouldSwitchFromP2PToHttp =
            canLoadThroughHttp &&
            request.downloadSource === "p2p" &&
            (this.requests.executingHttpCount < simultaneousHttpDownloads ||
              this.abortLastLoadingInQueueAfterItem(queue, segment, "http"));

          if (shouldSwitchFromP2PToHttp) {
            request.cancel();
            this.loadThroughHttp(segment);
          }

          continue;
        }

        // High-demand request is not loading

        const shouldLoadThroughHttp =
          canLoadThroughHttp &&
          (this.requests.executingHttpCount < simultaneousHttpDownloads ||
            this.abortLastLoadingInQueueAfterItem(queue, segment, "http"));

        if (shouldLoadThroughHttp) {
          this.loadThroughHttp(segment);
          continue;
        }

        const canLoadThroughP2P =
          this.p2pLoaders.currentLoader.isSegmentLoadedBySomeone(segment) &&
          (this.requests.executingP2PCount < simultaneousP2PDownloads ||
            this.abortLastLoadingInQueueAfterItem(queue, segment, "p2p"));

        if (canLoadThroughP2P) {
          this.loadThroughP2P(segment);
        }
      } else {
        // Regular requests load via P2P; HTTP prefetching is the owner's job,
        // decided below.

        const canLoadThroughP2P =
          statuses.isP2PDownloadable &&
          request?.status !== "loading" &&
          this.requests.executingP2PCount < simultaneousP2PDownloads;

        if (canLoadThroughP2P) {
          this.loadThroughP2P(segment);
        }
      }
    }

    // A queue pass runs on every playlist refresh, so the owner of a segment
    // that just appeared fetches it now rather than on the next timer tick.
    if (!isInitialHttpWait) this.prefetchThroughHttp();
  }

  // api method for engines
  abortSegmentRequest(segmentRuntimeId: string) {
    if (this.engineRequest?.segment.runtimeId !== segmentRuntimeId) return;
    this.engineRequest.abort();
    this.logger(
      "abort: ",
      LoggerUtils.getSegmentString(this.engineRequest.segment),
    );
    this.engineRequest = undefined;
    this.requestProcessQueueMicrotask();
  }

  private loadThroughHttp(segment: SegmentWithStream) {
    const request = this.requests.getOrCreateRequest(segment);
    const executor = new HttpRequestExecutor(
      request,
      this.config,
      this.eventTarget,
    );
    executor.execute();
    this.p2pLoaders.currentLoader.broadcastAnnouncement();
  }

  private loadThroughP2P(segment: SegmentWithStream) {
    this.p2pLoaders.currentLoader.downloadSegment(segment);
  }

  /**
   * HTTP prefetching of segments nobody has yet. Each candidate has one
   * elected owner among the connected peers (see specs/prefetch.md); the
   * owner fetches at once, everyone else waits for its announcement and
   * takes the segment over P2P. The others are ranked as backups by the same
   * scores, and a backup steps in only when waiting any longer would risk
   * the fetch landing inside the player's high-demand window — judged from
   * the time left until then and the fetch time this peer expects.
   */
  private prefetchThroughHttp() {
    const { httpDownloadInitialTimeoutMs } = this.config;
    const isInitialHttpWait =
      httpDownloadInitialTimeoutMs > 0 &&
      performance.now() - this.createdAt < httpDownloadInitialTimeoutMs;

    if (isInitialHttpWait) return;

    const availableStorageCapacityPercent =
      this.getAvailableStorageCapacityPercent();
    if (availableStorageCapacityPercent <= 10) return;

    const {
      simultaneousHttpDownloads,
      httpErrorRetries,
      highDemandTimeWindow,
    } = this.config;
    const p2pLoader = this.p2pLoaders.currentLoader;
    if (!p2pLoader.connectedPeerCount) return;

    this.syncPlayback();
    const peerIds = Array.from(p2pLoader.connectedPeerIds);

    for (const { segment, statuses } of QueueUtils.generateQueue(
      this.lastRequestedSegment,
      this.playback,
      this.config,
      p2pLoader,
      availableStorageCapacityPercent,
    )) {
      if (this.requests.executingHttpCount >= simultaneousHttpDownloads) break;
      if (
        !statuses.isHttpDownloadable ||
        statuses.isP2PDownloadable ||
        this.segmentStorage.hasSegment(
          segment.stream.swarmId,
          segment.stream.streamSwarmId,
          segment.externalId,
        )
      ) {
        continue;
      }
      const request = this.requests.get(segment);
      if (
        request &&
        (request.status === "loading" ||
          request.status === "succeed" ||
          request.failedAttempts.httpAttemptsCount >= httpErrorRetries)
      ) {
        continue;
      }

      const rank = ElectionUtils.rankForSegment(
        this.peerId,
        peerIds,
        segment.externalId,
      );
      const secondsToHighDemand =
        getDistanceFromPlayhead(segment, this.playback).start -
        highDemandTimeWindow * this.playback.rate;
      const estimatedFetchSeconds = this.estimateFetchSeconds(segment);

      if (
        ElectionUtils.shouldFetchNow({
          rank,
          secondsToHighDemand,
          estimatedFetchSeconds,
        })
      ) {
        this.logger(
          `prefetch ${LoggerUtils.getSegmentString(segment)} as ${rank === 0 ? "owner" : `backup #${rank}`}`,
        );
        this.loadThroughHttp(segment);
      }
    }
  }

  /**
   * Expected wall-clock seconds to fetch the segment over HTTP: its size,
   * estimated from segments of the same stream already loaded or else from
   * the stream's bitrate, over the throughput HTTP transfers have achieved.
   * With no transfer measured yet the link is assumed to run at the stream's
   * bitrate, which errs on the side of stepping in early.
   */
  private estimateFetchSeconds(segment: SegmentWithStream): number {
    const { stream } = segment;
    const duration = Math.max(0, segment.endTime - segment.startTime);
    const bitrate = stream.properties.bitrate ?? 0;

    const bytes =
      this.segmentBytesByStream.get(stream.runtimeId) ??
      (bitrate * duration) / 8;
    if (bytes <= 0) return duration;

    const { http } = this.bandwidthCalculators;
    const measured = Math.max(
      http.getBandwidthLoadingOnly(10),
      http.getBandwidthLoadingOnly(30),
    );
    const bandwidth = measured > 0 ? measured : bitrate;
    if (bandwidth <= 0) return duration;

    return (bytes * 8) / bandwidth;
  }

  private noteSegmentBytes(segment: SegmentWithStream, bytes: number) {
    if (bytes <= 0) return;
    const key = segment.stream.runtimeId;
    const previous = this.segmentBytesByStream.get(key);
    this.segmentBytesByStream.set(
      key,
      previous === undefined
        ? bytes
        : previous + SEGMENT_BYTES_EWMA_ALPHA * (bytes - previous),
    );
  }

  private abortLastLoadingInQueueAfterItem(
    queue: QueueUtils.QueueItem[],
    segment: SegmentWithStream,
    downloadSource: DownloadSource,
  ): boolean {
    for (const { segment: itemSegment } of Utils.arrayBackwards(queue)) {
      if (itemSegment === segment) break;
      const request = this.requests.get(itemSegment);
      if (
        request?.downloadSource === downloadSource &&
        request.status === "loading"
      ) {
        request.cancel();
        return true;
      }
    }
    return false;
  }

  private getAvailableStorageCapacityPercent(): number {
    const { totalCapacity, usedCapacity } = this.segmentStorage.getUsage();
    return 100 - (usedCapacity / totalCapacity) * 100;
  }

  private generateQueue() {
    this.syncPlayback();
    const queue: QueueItem[] = [];
    const queueSegmentIds = new Set<string>();
    let maxPossibleLength = 0;
    let alreadyLoadedCount = 0;

    const availableStorageCapacityPercent =
      this.getAvailableStorageCapacityPercent();
    for (const item of QueueUtils.generateQueue(
      this.lastRequestedSegment,
      this.playback,
      this.config,
      this.p2pLoaders.currentLoader,
      availableStorageCapacityPercent,
    )) {
      maxPossibleLength++;
      const { segment } = item;

      if (
        this.segmentStorage.hasSegment(
          segment.stream.swarmId,
          segment.stream.streamSwarmId,
          segment.externalId,
        ) ||
        this.requests.get(segment)?.status === "succeed"
      ) {
        alreadyLoadedCount++;
        continue;
      }
      queue.push(item);
      queueSegmentIds.add(segment.runtimeId);
    }

    return {
      queue,
      queueSegmentIds,
      maxPossibleLength,
      alreadyLoadedCount,
      queueDownloadRatio:
        maxPossibleLength !== 0 ? alreadyLoadedCount / maxPossibleLength : 0,
    };
  }

  private getBandwidth(queueDownloadRatio: number) {
    const { http, all } = this.bandwidthCalculators;
    const activeLevelBitrate =
      this.lastRequestedSegment.stream.properties.bitrate ?? 0;
    if (activeLevelBitrate === 0) {
      return all.getBandwidthLoadingOnly(3);
    }

    const bandwidth = Math.max(
      all.getBandwidth(30, this.levelChangedTimestamp),
      all.getBandwidth(60, this.levelChangedTimestamp),
      all.getBandwidth(90, this.levelChangedTimestamp),
    );

    if (queueDownloadRatio >= 0.8 || bandwidth >= activeLevelBitrate * 0.9) {
      return Math.max(
        all.getBandwidthLoadingOnly(1),
        all.getBandwidthLoadingOnly(3),
        all.getBandwidthLoadingOnly(5),
      );
    }

    const httpRealBandwidth = Math.max(
      http.getBandwidthLoadingOnly(1),
      http.getBandwidthLoadingOnly(3),
      http.getBandwidthLoadingOnly(5),
    );

    return Math.max(bandwidth, httpRealBandwidth);
  }

  sendBroadcastAnnouncement(sendEmptySegmentsAnnouncement = false) {
    this.p2pLoaders.currentLoader.broadcastAnnouncement(
      sendEmptySegmentsAnnouncement,
    );
  }

  updatePlayback(state: PlaybackState) {
    this.playbackTracker.report(state);
    const changed = this.syncPlayback();
    if (!changed) return;

    if (this.oracleLogger.enabled) {
      const { bufferEdge, bufferAhead, source } = this.playback;
      this.oracleLogger(
        `${this.lastRequestedSegment.stream.type} playhead≈${(bufferEdge - bufferAhead).toFixed(3)} (${source})`,
      );
    }

    // The store compares this position against the segment times it was given,
    // which are manifest time — so the position must be manifest time too.
    const { bufferEdge, bufferAhead, rate } = this.playback;
    this.segmentStorage.onPlaybackUpdated(bufferEdge - bufferAhead, rate);
    this.requestProcessQueueMicrotask(false);
  }

  /**
   * Copies the tracker's current view into the shared `playback` object.
   * Returns whether anything changed.
   *
   * A paused player reports rate 0. Window sizing keeps the last non-zero
   * rate instead, so prefetching continues while paused and the buffer is
   * ready on resume — the behaviour the absolute-position code had.
   */
  private syncPlayback(): boolean {
    const next = this.playbackTracker.getPlayback();
    const rate = next.rate === 0 ? this.playback.rate : next.rate;
    const changed =
      this.playback.bufferEdge !== next.bufferEdge ||
      this.playback.bufferAhead !== next.bufferAhead ||
      this.playback.rate !== rate ||
      this.playback.source !== next.source;
    this.playback.bufferEdge = next.bufferEdge;
    this.playback.bufferAhead = next.bufferAhead;
    this.playback.rate = rate;
    this.playback.source = next.source;
    return changed;
  }

  updateStream(stream: StreamWithSegments) {
    if (stream !== this.lastRequestedSegment.stream) return;
    this.logger(`update stream: ${LoggerUtils.getStreamString(stream)}`);
    this.requestProcessQueueMicrotask();
  }

  destroy() {
    clearTimeout(this.randomHttpDownloadTimeout);
    clearTimeout(this.initialHttpDelayTimeoutId);
    this.engineRequest?.abort();
    this.requests.destroy();
    this.p2pLoaders.destroy();
  }
}
