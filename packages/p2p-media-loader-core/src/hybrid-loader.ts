import { diagnostics } from "./diagnostics.js";
import { HttpRequestExecutor } from "./http-loader.js";
import { runAll } from "./run-all.js";
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
import type { Request } from "./requests/request.js";
import * as QueueUtils from "./utils/queue.js";
import * as LoggerUtils from "./utils/logger.js";
import * as Utils from "./utils/utils.js";
import * as ElectionUtils from "./utils/election.js";
import { PlaybackTimeWindowsConfig } from "./utils/stream.js";
import {
  urgentBufferThresholdFor,
  playerBufferFor,
  type LiveDelay,
} from "./live-delay.js";
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
  private readonly playbackTracker = new PlaybackTracker();
  private readonly logger: debug.Debugger;
  private levelChangedTimestamp?: number;
  private lastQueueProcessingTimeStamp?: number;
  private prefetchTimerId?: number;
  private readonly diagnosticsToken = diagnostics?.open("HybridLoader");
  /** Running estimate of segment size per stream, from segments already loaded. */
  private readonly segmentBytesByStream = new Map<string, number>();
  private initialHttpDelayTimeoutId?: number;
  private isProcessQueueMicrotaskCreated = false;
  /** The urgency threshold last logged, so the log says when it moves. */
  private loggedThreshold?: { threshold: number; source: string };
  private destroyed = false;
  /**
   * The engine request the storage is answering, while it is: this loader's
   * to abort meanwhile, and not the queue's to start a download for.
   */
  private readingFromStorage?: EngineRequest;
  private readonly createdAt = performance.now();
  /**
   * The engine request that was not urgent when it arrived, while it waits:
   * counted once more if it becomes urgent before it is served.
   */
  private waitingNotUrgent?: EngineRequest;

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
    this.requests = new RequestsContainer(
      this.requestProcessQueueMicrotask,
      this.bandwidthCalculators,
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

    this.notifyStoragePosition();
    this.setIntervalLoading();
  }

  /**
   * A backup's deadline, and the moment a waiting request becomes urgent,
   * pass with no queue event behind them — a paused player reports nothing,
   * and a report ages between two others — so both are re-checked on a timer
   * as well. Its period is one to two seconds whatever the swarm's size: the
   * deadlines it judges are sub-second multiples of a fetch time, and a
   * period that grew with the peer count would let a request become urgent
   * unfetched with the timer still tens of seconds off.
   * The jitter spreads the passes of peers that started together.
   *
   * Every tick elects, and while a request waits, every tick runs a whole
   * pass, which judges the request again. The election reads the player's
   * last report, the connected peers, the bandwidth samples behind the
   * fetch-time estimate and the HTTP slots in use, and any of them can move
   * with no pass to show for it; tracking which one did would cost more
   * bookkeeping than the passes it saves.
   * A queue is a walk over the stream's segment map up to the segment last
   * requested — sub-millisecond at any length a stream has — and a reporting
   * player already drives that walk once a second through its reports.
   */
  private setIntervalLoading() {
    const period = PEER_UPDATE_LATENCY * (1 + Math.random());
    this.prefetchTimerId = window.setTimeout(() => {
      // `destroy()` clears this timer; a tick after it is one it missed.
      if (this.destroyed) {
        diagnostics?.anomaly("HybridLoader prefetch tick after destroy");
      }
      try {
        if (this.engineRequest?.status === "pending") {
          this.processQueue();
        } else {
          this.prefetchThroughHttp();
        }
      } catch (error) {
        // A custom segment storage is the integrator's code and may throw
        // once; the timer outlives it — for a paused player or a proxy it is
        // all that elects, and a chain ended here would end for the session.
        this.logger("prefetch tick failed: %O", error);
      } finally {
        if (!this.destroyed) this.setIntervalLoading();
      }
    }, period);
  }

  // api method for engines
  async loadSegment(
    segment: Readonly<SegmentWithStream>,
    callbacks: EngineCallbacks,
  ) {
    this.logger(`requests: ${LoggerUtils.getSegmentString(segment)}`);
    const { stream } = segment;
    // Created first, and everything else done inside the try: the request has
    // to be able to fail. A throw from here on — a custom segment storage is
    // the integrator's own code — would otherwise settle nothing, and the
    // player would wait on that promise for ever.
    const engineRequest = new EngineRequest(segment, callbacks);

    try {
      if (stream !== this.lastRequestedSegment.stream) {
        this.logger(`stream changed to ${LoggerUtils.getStreamString(stream)}`);
        this.p2pLoaders.changeCurrentLoader(stream);
        // The active rendition follows from the requested segment; bandwidth
        // measured before the switch says nothing about the new one.
        this.levelChangedTimestamp = performance.now();
      }
      // Every request moves the position, whatever kind it is: one that
      // continues the stream, the first after a seek, or one for media the
      // player holds. See specs/playback-contract.md, "The position".
      this.lastRequestedSegment = segment;
      this.notifyStoragePosition();
      // This loader's request from here, before the storage is read: a
      // custom storage answers asynchronously, and an abort arriving while
      // it does must find the request to abort — or the bytes would be
      // delivered to a player that has moved on, and counted as buffered.
      this.engineRequest?.abort();
      this.engineRequest = engineRequest;

      this.segmentStorage.onSegmentRequested(
        stream.swarmId,
        stream.streamSwarmId,
        segment.externalId,
        segment.startTime,
        segment.endTime,
        stream.type,
        this.streamDetails.isLive,
      );

      const hasSegment = this.segmentStorage.hasSegment(
        stream.swarmId,
        stream.streamSwarmId,
        segment.externalId,
      );

      if (hasSegment) {
        this.readingFromStorage = engineRequest;
        let data: ArrayBuffer | undefined;
        try {
          data = await this.segmentStorage.getSegmentData(
            stream.swarmId,
            stream.streamSwarmId,
            segment.externalId,
          );
        } finally {
          if (this.readingFromStorage === engineRequest) {
            this.readingFromStorage = undefined;
          }
        }
        // Aborted while the storage was read: settled, and let go of.
        if (engineRequest.status !== "pending") return;
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
          this.engineRequest = undefined;
          return;
        }
      }

      this.judgeUrgencyOnArrival(engineRequest);

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
      if (this.engineRequest === engineRequest) this.engineRequest = undefined;
    } finally {
      this.requestProcessQueueMicrotask();
    }
  }

  private requestProcessQueueMicrotask = (force = true) => {
    if (this.destroyed) return;
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
        // A request settling schedules a pass; an adapter tearing the core
        // down in the same task destroys this loader before it runs. The
        // pass would otherwise reach a storage and P2P loaders already torn
        // down — an integrator's storage that released its backend throws.
        if (this.destroyed) return;
        this.processQueue();
        this.lastQueueProcessingTimeStamp = now;
      } finally {
        this.isProcessQueueMicrotaskCreated = false;
      }
    });
  };

  /** @returns Whether a segment was stored, which moves the storage usage. */
  private processRequests(
    queueSegmentIds: Set<string>,
    queueDownloadRatio: number,
  ): boolean {
    const { stream } = this.lastRequestedSegment;
    const { httpErrorRetries } = this.config;
    const now = performance.now();
    let stored = false;
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
          }
          this.requests.remove(request);
          this.noteSegmentBytes(segment, request.data.byteLength);

          this.logger(
            `succeed: ${LoggerUtils.getSegmentString(segment)} (byteLength: ${request.data.byteLength})`,
          );

          // Under the stream the request was made for, which is not always
          // the one last requested: a request of the previous rendition that
          // settles after a switch would otherwise be filed under the new
          // one's identity, and served to the player and to peers as it.
          void this.segmentStorage.storeSegment(
            segment.stream.swarmId,
            segment.stream.streamSwarmId,
            segment.externalId,
            request.data,
            segment.startTime,
            segment.endTime,
            segment.stream.type,
            this.streamDetails.isLive,
          );
          stored = true;
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
    return stored;
  }

  private processQueue() {
    const {
      queue,
      queueSegmentIds,
      queueDownloadRatio,
      availableStorageCapacityPercent,
    } = this.generateQueue();
    const stored = this.processRequests(queueSegmentIds, queueDownloadRatio);

    const { simultaneousP2PDownloads, httpDownloadInitialTimeoutMs } =
      this.config;

    const timeSinceStart = performance.now() - this.createdAt;
    const isInitialHttpWait =
      httpDownloadInitialTimeoutMs > 0 &&
      timeSinceStart < httpDownloadInitialTimeoutMs;

    if (isInitialHttpWait) {
      this.initialHttpDelayTimeoutId ??= window.setTimeout(() => {
        if (this.destroyed) {
          diagnostics?.anomaly("HybridLoader initial HTTP delay after destroy");
        }
        this.initialHttpDelayTimeoutId = undefined;
        this.requestProcessQueueMicrotask();
      }, httpDownloadInitialTimeoutMs - timeSinceStart);
    }

    this.processEngineRequest(isInitialHttpWait);

    // Prefetch over P2P: a segment in the P2P window from any peer that has
    // it. Nothing in the queue is urgent; HTTP prefetching is the owner's
    // job, decided below.
    for (const { segment, statuses } of queue) {
      if (!statuses.isP2PDownloadable) continue;
      if (this.requests.executingP2PCount >= simultaneousP2PDownloads) break;
      const status = this.requests.get(segment)?.status;
      if (status === "succeed" || status === "loading") continue;
      this.loadThroughP2P(segment);
    }

    // A queue pass runs on every playlist refresh, so the owner of a segment
    // that just appeared fetches it now rather than on the next timer tick.
    // The capacity was measured before the requests that settled this pass
    // were stored; where any was, the brake on prefetching reads it afresh.
    // Exact for the memory storage, which stores synchronously; a custom
    // storage that writes asynchronously may not have landed the bytes yet,
    // and the brake then reads what it would have read anyway.
    if (!isInitialHttpWait) {
      this.prefetchThroughHttp(
        queue,
        stored ? undefined : availableStorageCapacityPercent,
      );
    }
  }

  /**
   * The player's request, judged by its urgency. See
   * specs/playback-contract.md, "Urgency".
   *
   * - Urgent: over HTTP at once, taking a slot from the HTTP download
   *   furthest ahead where none is free, and moving a P2P download of it to
   *   HTTP. With no peer connected it is fetched the same way: nobody can
   *   give the segment, and no election runs.
   * - Not urgent: from a peer that has it. If none has it, the election
   *   decides who fetches it over HTTP (`prefetchThroughHttp`), or it waits;
   *   the buffer drains while it waits, and it becomes urgent in time.
   */
  private processEngineRequest(isInitialHttpWait: boolean) {
    const { engineRequest } = this;
    // Not while the storage is answering it: the request is this loader's
    // from before the read so that an abort meanwhile finds it, and a
    // download started for it here would run beside the bytes the storage
    // is about to hand over.
    if (
      engineRequest?.status !== "pending" ||
      engineRequest === this.readingFromStorage
    ) {
      return;
    }
    const { segment } = engineRequest;
    const request = this.requests.get(segment);
    const urgent = this.isUrgent();
    if (urgent && this.waitingNotUrgent === engineRequest) {
      this.waitingNotUrgent = undefined;
      diagnostics?.count("SegmentRequest:became-urgent");
      this.logger(
        `became urgent: ${LoggerUtils.getSegmentString(segment)} (buffer ${this.playbackTracker.bufferAhead().toFixed(2)}s)`,
      );
    }

    const { simultaneousP2PDownloads, httpErrorRetries } = this.config;
    const p2pLoader = this.p2pLoaders.currentLoader;
    const canLoadThroughHttp =
      !isInitialHttpWait &&
      (request?.failedAttempts.httpAttemptsCount ?? 0) < httpErrorRetries;

    if (request?.status === "loading") {
      if (!urgent) return;
      if (request.downloadSource === "http") {
        // Already coming over HTTP — perhaps fetched as the owner's prefetch
        // before it was urgent: it has the link to itself from now on.
        this.yieldHttpPrefetchTo(segment);
      } else if (canLoadThroughHttp) {
        request.cancel();
        this.yieldHttpPrefetchTo(segment);
        this.loadThroughHttp(segment);
      }
      return;
    }
    if (request?.status === "succeed") return;

    if (urgent && canLoadThroughHttp) {
      this.yieldHttpPrefetchTo(segment);
      this.loadThroughHttp(segment);
      return;
    }
    const startNow =
      urgent ||
      p2pLoader.connectedPeerCount === 0 ||
      engineRequest.shouldBeStartedImmediately;
    if (startNow && canLoadThroughHttp && this.freeSlotFor(segment, "http")) {
      this.loadThroughHttp(segment);
      return;
    }

    // Not urgent, or no HTTP for it — before the initial HTTP delay ends, or
    // once its HTTP attempts are spent: from a peer that has it. Only a
    // request that must start now takes a slot from prefetch to do so.
    if (
      p2pLoader.isSegmentLoadingOrLoadedBySomeone(segment) &&
      (this.requests.executingP2PCount < simultaneousP2PDownloads ||
        (startNow && this.abortFurthestDownloadFor(segment, "p2p")))
    ) {
      this.loadThroughP2P(segment);
    }
  }

  /**
   * Gives the link to an urgent request: stops every HTTP download of this
   * loader that is not for `segment`. An owner's prefetch keeps its HTTP slots
   * busy, and beside it the player's request downloads slower than it would
   * without P2P. P2P downloads go on — they are what P2P is for, and a peer's
   * upload rarely fills a viewer's link. See specs/playback-contract.md,
   * "Urgency".
   */
  private yieldHttpPrefetchTo(segment: SegmentWithStream) {
    for (const request of this.requests.items()) {
      if (
        request.downloadSource !== "http" ||
        request.status !== "loading" ||
        request.segment === segment
      ) {
        continue;
      }
      request.cancel();
      diagnostics?.count("Prefetch:yielded-to-urgent");
      this.logger(
        `stopped ${LoggerUtils.getSegmentString(request.segment)} for the urgent ${LoggerUtils.getSegmentString(segment)}`,
      );
    }
  }

  /**
   * Whether the player's urgent request is downloading over HTTP: the HTTP
   * prefetch then starts nothing until it ends.
   */
  private isUrgentRequestOnHttp(): boolean {
    const { engineRequest } = this;
    if (engineRequest?.status !== "pending") return false;
    const request = this.requests.get(engineRequest.segment);
    return (
      request?.status === "loading" &&
      request.downloadSource === "http" &&
      this.isUrgent()
    );
  }

  /** Whether a slot of `source` is free for `segment`, freeing one if not. */
  private freeSlotFor(
    segment: SegmentWithStream,
    source: DownloadSource,
  ): boolean {
    const executing =
      source === "http"
        ? this.requests.executingHttpCount
        : this.requests.executingP2PCount;
    const limit =
      source === "http"
        ? this.config.simultaneousHttpDownloads
        : this.config.simultaneousP2PDownloads;
    return executing < limit || this.abortFurthestDownloadFor(segment, source);
  }

  /**
   * Whether a request the player makes now is urgent: its buffer is below the
   * urgency threshold, at the rate it plays. See specs/playback-contract.md,
   * "Urgency".
   */
  private isUrgent(): boolean {
    return (
      this.playbackTracker.bufferAhead() <
      this.urgentBufferThreshold() * this.playbackTracker.rate()
    );
  }

  /**
   * Counts and logs the urgency of a request the storage cannot serve, as it
   * arrives; a request that is not urgent is remembered, to count it again
   * if it becomes urgent while it waits.
   */
  private judgeUrgencyOnArrival(engineRequest: EngineRequest) {
    const urgent = this.isUrgent();
    diagnostics?.count(
      urgent ? "SegmentRequest:urgent" : "SegmentRequest:not-urgent",
    );
    this.waitingNotUrgent = urgent ? undefined : engineRequest;
    this.logger(
      `${urgent ? "urgent" : "not urgent"}: ${LoggerUtils.getSegmentString(engineRequest.segment)} (buffer ${this.playbackTracker.bufferAhead().toFixed(2)}s, threshold ${this.urgentBufferThreshold().toFixed(2)}s)`,
    );
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
   * HTTP prefetching of segments nobody has yet: fetches the ones this peer
   * owns before its player asks. Each candidate has one elected owner among
   * the connected peers (see specs/prefetch.md); the owner fetches at once,
   * everyone else waits for its announcement and takes the segment over P2P.
   * The others are ranked as backups by the same scores. A backup acts only
   * on the segment its own player has requested, and steps in only when
   * waiting any longer would risk the request becoming urgent first — judged
   * from the time left until then and the fetch time this peer expects.
   * Before the request there is no deadline to judge: the core keeps no
   * playhead to measure one from.
   *
   * @param queue - The queue of the pass this runs at the end of. Generating
   * one walks the stream's segments from the first to the one last requested,
   * which is the length of the stream on a long VOD, so a pass generates one
   * queue and uses it twice. The prefetch timer has no pass behind it and
   * passes nothing.
   * @param capacityPercent - The storage capacity the pass measured for that
   * queue; measuring walks the whole segment cache, so a pass measures once.
   */
  private prefetchThroughHttp(
    queue?: readonly QueueItem[],
    capacityPercent?: number,
  ) {
    const { httpDownloadInitialTimeoutMs } = this.config;
    const isInitialHttpWait =
      httpDownloadInitialTimeoutMs > 0 &&
      performance.now() - this.createdAt < httpDownloadInitialTimeoutMs;

    if (isInitialHttpWait) return;
    // An urgent request has the link to itself while it downloads.
    if (this.isUrgentRequestOnHttp()) return;

    // Nothing to elect without peers — checked before measuring the storage,
    // which walks the whole segment cache.
    const p2pLoader = this.p2pLoaders.currentLoader;
    if (!p2pLoader.connectedPeerCount) return;

    const availableStorageCapacityPercent =
      capacityPercent ?? this.getAvailableStorageCapacityPercent();
    if (availableStorageCapacityPercent <= 10) return;

    const { simultaneousHttpDownloads, httpErrorRetries } = this.config;
    const peerIds = Array.from(p2pLoader.connectedPeerIds);
    const { http } = this.bandwidthCalculators;
    const measuredBandwidth = Math.max(
      http.getBandwidthLoadingOnly(10),
      http.getBandwidthLoadingOnly(30),
    );
    const requested =
      this.engineRequest?.status === "pending"
        ? this.engineRequest.segment.runtimeId
        : undefined;

    const items =
      queue ??
      QueueUtils.generateQueue(
        this.lastRequestedSegment,
        this.playback(),
        this.timeWindows(),
        p2pLoader,
        availableStorageCapacityPercent,
      );

    for (const { segment, statuses } of items) {
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
      if (rank > 0) {
        if (segment.runtimeId !== requested) continue;
        const secondsLeft = ElectionUtils.secondsToUrgent(
          this.playbackTracker.bufferAhead(),
          this.urgentBufferThreshold(),
          this.playbackTracker.rate(),
        );
        const estimatedFetchSeconds = this.estimateFetchSeconds(
          segment,
          measuredBandwidth,
        );
        if (
          !ElectionUtils.shouldFetchNow({
            rank,
            secondsLeft,
            estimatedFetchSeconds,
          })
        ) {
          continue;
        }
      }

      this.logger(
        `prefetch ${LoggerUtils.getSegmentString(segment)} as ${rank === 0 ? "owner" : `backup #${rank}`}`,
      );
      this.loadThroughHttp(segment);
    }
  }

  /**
   * Expected wall-clock seconds to fetch the segment over HTTP: its size,
   * estimated from segments of the same stream already loaded or else from
   * the stream's bitrate, over the throughput HTTP transfers have achieved.
   * With no transfer measured yet the link is assumed to run at the stream's
   * bitrate, which errs on the side of stepping in early.
   *
   * @param measured - HTTP throughput measured for the pass, the same for
   * every segment it elects.
   */
  private estimateFetchSeconds(
    segment: SegmentWithStream,
    measured: number,
  ): number {
    const { stream } = segment;
    const duration = Math.max(0, segment.endTime - segment.startTime);
    const bitrate = stream.properties.bitrate ?? 0;

    const bytes =
      this.segmentBytesByStream.get(stream.runtimeId) ??
      (bitrate * duration) / 8;
    if (bytes <= 0) return duration;

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

  /**
   * Frees a slot for the player's request that must start now: aborts the
   * loading download of `source` furthest ahead that is not for `segment`.
   */
  private abortFurthestDownloadFor(
    segment: SegmentWithStream,
    source: DownloadSource,
  ): boolean {
    let furthest: Request | undefined;
    for (const request of this.requests.items()) {
      if (
        request.downloadSource !== source ||
        request.status !== "loading" ||
        request.segment === segment
      ) {
        continue;
      }
      if (!furthest || request.segment.startTime > furthest.segment.startTime) {
        furthest = request;
      }
    }
    if (!furthest) return false;
    furthest.cancel();
    return true;
  }

  private getAvailableStorageCapacityPercent(): number {
    const { totalCapacity, usedCapacity } = this.segmentStorage.getUsage();
    return 100 - (usedCapacity / totalCapacity) * 100;
  }

  /** The two windows a pass prefetches by. */
  private timeWindows(): PlaybackTimeWindowsConfig {
    const { httpDownloadTimeWindow, p2pDownloadTimeWindow } = this.config;
    return { httpDownloadTimeWindow, p2pDownloadTimeWindow };
  }

  /** Where the windows are measured from, and the rate that sizes them. */
  private playback(): Playback {
    return {
      position: this.lastRequestedSegment.startTime,
      rate: this.playbackTracker.rate(),
    };
  }

  /**
   * The buffer below which a request is urgent. It is derived from the live
   * placement where none is configured — half of what the player buffers, see
   * `urgentBufferThresholdFor` — and the derivation is logged when it first
   * resolves and whenever it moves, so a stream that shares little can be
   * read against the geometry it was judged on.
   */
  private urgentBufferThreshold(): number {
    const configured = this.config.urgentBufferThreshold;
    const target = this.streamDetails.isLive
      ? this.streamDetails.liveTarget
      : undefined;
    const threshold = urgentBufferThresholdFor(configured, target);
    this.logThreshold(threshold, configured, target);
    return threshold;
  }

  /**
   * Says where the threshold came from, not merely whether a number was
   * configured: on live the geometry caps what an integrator asks for, and
   * this line is the only place that is visible. Reporting a capped threshold
   * as theirs is what would send someone looking for the bug in their own
   * configuration.
   */
  private logThreshold(
    threshold: number,
    configured: number | undefined,
    target: LiveDelay | undefined,
  ) {
    const seconds = (value: number) => Number(value.toFixed(2));
    // `urgentBufferThresholdFor` returns the configured number itself where
    // it stands, so anything else is the geometry having capped it.
    let source: string;
    if (configured === undefined) source = target ? "derived" : "default";
    else if (threshold === configured) source = "configured";
    else source = `configured ${seconds(configured)}s, capped by the window`;

    const last = this.loggedThreshold;
    // Segment durations are not exact multiples, so a derived threshold
    // drifts by fractions of a second between refreshes; only half a segment
    // is a change of the threshold itself.
    const tolerance = target ? target.segment / 2 : 0;
    if (
      last?.source === source &&
      Math.abs(last.threshold - threshold) <= tolerance
    ) {
      return;
    }
    this.loggedThreshold = { threshold, source };
    if (target) {
      this.logger(
        "urgency threshold %ss (%s): live delay %ss, segment %ss, player buffer %ss",
        seconds(threshold),
        source,
        seconds(target.delay),
        seconds(target.segment),
        seconds(playerBufferFor(target)),
      );
    } else {
      this.logger(
        "urgency threshold %ss (%s), no live window",
        seconds(threshold),
        source,
      );
    }
  }

  private generateQueue() {
    const queue: QueueItem[] = [];
    const queueSegmentIds = new Set<string>();
    let maxPossibleLength = 0;
    let alreadyLoadedCount = 0;

    const availableStorageCapacityPercent =
      this.getAvailableStorageCapacityPercent();
    for (const item of QueueUtils.generateQueue(
      this.lastRequestedSegment,
      this.playback(),
      this.timeWindows(),
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
      availableStorageCapacityPercent,
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

  /**
   * Takes the player's report. A request that waits is judged again at once
   * when the report shows it has become urgent; otherwise a pass follows at
   * most once a second, as reports come several times a second.
   *
   * @param at - When the report was made, for a loader created after it.
   */
  updatePlayback(state: PlaybackState, at?: number) {
    const rateChanged = this.playbackTracker.report(state, at);
    if (rateChanged) this.notifyStoragePosition();
    const request = this.engineRequest;
    const becameUrgent =
      request?.status === "pending" &&
      this.waitingNotUrgent === request &&
      this.isUrgent();
    this.requestProcessQueueMicrotask(becameUrgent || rateChanged);
  }

  /**
   * Tells the store the position: the start of the segment requested last,
   * on the manifest timeline, as its segment times are. See
   * specs/playback-contract.md, "What the segment store receives". A custom
   * storage is the integrator's code and free to throw; a throw here would
   * be a request that never settles, or a loader that never exists.
   */
  private notifyStoragePosition() {
    for (const failure of runAll([
      () =>
        this.segmentStorage.onPlaybackUpdated(
          this.lastRequestedSegment.startTime,
          this.playbackTracker.rate(),
          this.lastRequestedSegment.stream.type,
        ),
    ])) {
      this.logger("the storage refused the position: %O", failure);
    }
  }

  updateStream(stream: StreamWithSegments) {
    if (stream !== this.lastRequestedSegment.stream) return;
    this.logger(`update stream: ${LoggerUtils.getStreamString(stream)}`);
    this.requestProcessQueueMicrotask();
  }

  destroy() {
    diagnostics?.close(this.diagnosticsToken, "destroyed");
    this.destroyed = true;
    clearTimeout(this.prefetchTimerId);
    clearTimeout(this.initialHttpDelayTimeoutId);
    this.engineRequest?.abort();
    this.requests.destroy();
    this.p2pLoaders.destroy();
  }
}
