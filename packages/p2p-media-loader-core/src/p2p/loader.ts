import { diagnostics, type DiagnosticsToken } from "../diagnostics.js";
import { Peer } from "./peer.js";
import { CoreEventMap, PeerError, StreamConfig } from "../types.js";
import { SegmentWithStream, StreamWithSegments } from "../internal-types.js";
import { RequestsContainer } from "../requests/request-container.js";
import { AttemptTag, PeerDataFault } from "../requests/request.js";
import { WebTorrentManager } from "../webtorrent/webtorrent-manager/index.js";
import { WebTorrentSocketPool } from "../webtorrent/webtorrent-socket-pool/index.js";
import * as StreamUtils from "../utils/stream.js";
import * as Utils from "../utils/utils.js";
import { EventTarget } from "../utils/event-target.js";
import { SegmentStorage } from "../segment-storage/index.js";
import debug from "debug";

export type EventTargetMap = Record<`onStorageUpdated-${string}`, () => void> &
  CoreEventMap;

const MIN_CHURN_CLEANUP_INTERVAL_MS = 1000;

export class P2PLoader {
  readonly #webtorrentManager: WebTorrentManager;
  readonly #peersMap = new Map<string, Peer>();
  #isAnnounceMicrotaskCreated = false;
  /**
   * Bytes moved in this swarm since this loader joined it, reported to the
   * trackers. Complete transfers only: a segment when it is delivered, an
   * upload when its last byte is sent.
   */
  #downloadedBytes = 0;
  #uploadedBytes = 0;
  readonly #webtorrentManagerLogger = debug("p2pml-core:webtorrent-manager");
  readonly #churnLogger = debug("p2pml-core:churn-cleanup");

  readonly #stream: StreamWithSegments;
  readonly #requests: RequestsContainer;
  readonly #segmentStorage: SegmentStorage;
  readonly #config: StreamConfig;
  readonly #webTorrentSocketPool: WebTorrentSocketPool;
  readonly #eventTarget: EventTarget<EventTargetMap>;
  readonly #onSegmentAnnouncement: () => void;
  readonly #diagnosticsToken: DiagnosticsToken | undefined;
  readonly #unprobePeers: (() => void) | undefined;
  #churnCleanupTimeoutId?: ReturnType<typeof setTimeout>;

  readonly #onPeerConnect: CoreEventMap["onPeerConnect"];
  readonly #onPeerConnectError: CoreEventMap["onPeerConnectError"];
  readonly #onPeerClose: CoreEventMap["onPeerClose"];
  readonly #onPeerError: CoreEventMap["onPeerError"];
  readonly #onPeerWarning: CoreEventMap["onPeerWarning"];
  readonly #onTrackerWarning: CoreEventMap["onTrackerWarning"];
  readonly #onTrackerError: CoreEventMap["onTrackerError"];

  constructor(
    stream: StreamWithSegments,
    requests: RequestsContainer,
    segmentStorage: SegmentStorage,
    config: StreamConfig,
    webTorrentSocketPool: WebTorrentSocketPool,
    eventTarget: EventTarget<EventTargetMap>,
    peerId: string,
    onSegmentAnnouncement: () => void,
  ) {
    this.#stream = stream;
    this.#requests = requests;
    this.#segmentStorage = segmentStorage;
    this.#config = config;
    this.#webTorrentSocketPool = webTorrentSocketPool;
    this.#eventTarget = eventTarget;
    this.#onSegmentAnnouncement = onSegmentAnnouncement;

    this.#onPeerConnect = eventTarget.getEventDispatcher("onPeerConnect");
    this.#onPeerConnectError =
      eventTarget.getEventDispatcher("onPeerConnectError");
    this.#onPeerClose = eventTarget.getEventDispatcher("onPeerClose");
    this.#onPeerError = eventTarget.getEventDispatcher("onPeerError");
    this.#onPeerWarning = eventTarget.getEventDispatcher("onPeerWarning");
    this.#onTrackerWarning = eventTarget.getEventDispatcher("onTrackerWarning");
    this.#onTrackerError = eventTarget.getEventDispatcher("onTrackerError");

    this.#webtorrentManager = new WebTorrentManager({
      infoHash: this.#stream.infoHash,
      peerId,
      trackerUrls: this.#config.announceTrackers,
      rtcConfig: () => this.#config.rtcConfig,
      socketPool: this.#webTorrentSocketPool,
      maxPeers: () => this.#config.p2pMaxPeers,
      maxPeersMultiplier: () => this.#config.p2pChurnMaxPeersMultiplier,
      offersCount: () => this.#config.webRtcOffersCount,
      offerTimeout: () => this.#config.webRtcOfferTimeoutMs,
      iceGatheringTimeout: () => this.#config.webRtcIceGatheringTimeoutMs,
      connectionTimeout: () => this.#config.webRtcConnectionTimeoutMs,
      transferredBytes: () => ({
        uploaded: this.#uploadedBytes,
        downloaded: this.#downloadedBytes,
      }),
    });

    this.#webtorrentManager.addEventListener(
      "peerConnected",
      this.#onPeerConnectedWebTorrent,
    );

    this.#webtorrentManager.addEventListener(
      "peerDisconnected",
      this.#onPeerDisconnectedWebTorrent,
    );

    this.#webtorrentManager.addEventListener("peerConnectFailed", (event) => {
      this.#webtorrentManagerLogger(
        `Peer connection failed (${event.peerId}) from tracker ${event.trackerUrl}:`,
        event.error,
      );
      this.#onPeerConnectError({
        peerId: event.peerId,
        infoHash: this.#stream.infoHash,
        streamType: this.#stream.type,
        trackerUrl: event.trackerUrl,
        error: event.error,
      });
    });

    this.#webtorrentManager.addEventListener("warning", (event) => {
      this.#webtorrentManagerLogger(
        `Tracker warning (${event.trackerUrl}):`,
        event.warning,
      );
      this.#onTrackerWarning({
        trackerUrl: event.trackerUrl,
        infoHash: this.#stream.infoHash,
        streamType: this.#stream.type,
        warning: event.warning,
      });
    });

    this.#webtorrentManager.addEventListener("error", (event) => {
      this.#webtorrentManagerLogger(
        `Tracker error (${event.trackerUrl}):`,
        event.error,
      );
      this.#onTrackerError({
        trackerUrl: event.trackerUrl,
        infoHash: this.#stream.infoHash,
        streamType: this.#stream.type,
        error: event.error,
      });
    });

    this.#eventTarget.addEventListener(
      `onStorageUpdated-${this.#stream.streamSwarmId}`,
      this.broadcastAnnouncement,
    );

    this.#webtorrentManager.start();
    // Must equal the manager's PeersHeld: a peer held there and not wrapped
    // here is connected and never used.
    this.#unprobePeers = diagnostics?.probe(
      `PeersWrapped:${this.#stream.infoHash.slice(0, 8)}`,
      () => this.#peersMap.size,
    );
    this.#diagnosticsToken = diagnostics?.open(
      "P2PLoader",
      this.#stream.streamSwarmId.slice(-12),
    );

    this.#churnCleanupTimeoutId = setTimeout(
      this.#churnCleanup,
      Math.max(
        MIN_CHURN_CLEANUP_INTERVAL_MS,
        this.#config.p2pChurnCleanupIntervalMs,
      ),
    );
  }

  #churnCleanup = () => {
    // Schedule the next run dynamically based on the current config value, enforcing a minimum safe interval
    this.#churnCleanupTimeoutId = setTimeout(
      this.#churnCleanup,
      Math.max(
        MIN_CHURN_CLEANUP_INTERVAL_MS,
        this.#config.p2pChurnCleanupIntervalMs,
      ),
    );

    const excessPeersCount = this.#peersMap.size - this.#config.p2pMaxPeers;
    if (excessPeersCount <= 0) return;

    const eligiblePeers: Peer[] = [];
    const now = performance.now();

    for (const peer of this.#peersMap.values()) {
      // Don't drop peers that are actively downloading or uploading to avoid interrupting streams
      if (peer.downloadingSegment || peer.isUploadingSegment) continue;

      // Give new peers a grace period to establish connections and prove their bandwidth
      if (now - peer.connectedAt < this.#config.p2pChurnGracePeriodMs) {
        continue;
      }

      eligiblePeers.push(peer);
    }

    if (eligiblePeers.length === 0) return;

    eligiblePeers.sort((a, b) => {
      return (
        a.getDownloadBandwidth() - b.getDownloadBandwidth() ||
        a.connectedAt - b.connectedAt
      );
    });

    const peersToDrop = eligiblePeers.slice(0, excessPeersCount);

    this.#churnLogger(
      `Background churn cleanup: dropping ${peersToDrop.length} excess peers ` +
        `(total: ${this.#peersMap.size}, target: ${this.#config.p2pMaxPeers}, eligible: ${eligiblePeers.length})`,
    );

    for (const peer of peersToDrop) {
      this.#churnLogger(
        `dropping excess peer ${peer.id} with bandwidth ${peer.getDownloadBandwidth()}`,
      );
      peer.destroy();
    }
  };

  /**
   * Starts downloading `segment` from a peer that has all of it and sends
   * nothing else. `tag` says why the attempt was started.
   *
   * @returns Whether an attempt started. One that started can already have
   * settled — failed, as on a channel that is closing, or succeeded from
   * bytes held — which the request's status shows.
   */
  downloadSegment(segment: SegmentWithStream, tag?: AttemptTag): boolean {
    const peersWithSegment: Peer[] = [];
    for (const peer of this.#peersMap.values()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === "loaded"
      ) {
        peersWithSegment.push(peer);
      }
    }

    if (peersWithSegment.length === 0) return false;

    const selectedPeer = selectPeerForDownload(peersWithSegment);

    const request = this.#requests.getOrCreateRequest(segment);
    return selectedPeer.downloadSegment(request, tag);
  }

  /**
   * Makes a peer that has all of `segment` free to send it: where every such
   * peer downloads something else, the download of one of them stops. A peer
   * downloads one segment at a time, and in a small swarm the one peer that
   * has the segment is often busy with prefetch.
   *
   * @returns Whether a download was stopped.
   */
  freePeerFor(segment: SegmentWithStream): boolean {
    const toStop = segmentToStopFor(this.#peersMap.values(), segment);
    if (!toStop) return false;
    const request = this.#requests.get(toStop);
    if (request?.status !== "loading") return false;
    request.cancel();
    return true;
  }

  isSegmentLoadingOrLoadedBySomeone(segment: SegmentWithStream): boolean {
    for (const peer of this.#peersMap.values()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  isSegmentLoadedBySomeone(segment: SegmentWithStream): boolean {
    for (const peer of this.#peersMap.values()) {
      if (peer.getSegmentStatus(segment) === "loaded") return true;
    }
    return false;
  }

  get connectedPeerIds(): IterableIterator<string> {
    return this.#peersMap.keys();
  }

  get connectedPeerCount() {
    return this.#peersMap.size;
  }

  *peers() {
    for (const peer of this.#peersMap.values()) {
      yield peer;
    }
  }

  #getSegmentsAnnouncement() {
    const loaded: number[] = this.#segmentStorage.getStoredSegmentIds(
      this.#stream.swarmId,
      this.#stream.streamSwarmId,
    );
    const httpLoading: number[] = [];

    // Only downloads under way: a stopped or failed one announced as loading
    // makes peers wait for a segment that nobody is fetching.
    for (const request of this.#requests.loadingHttpRequests()) {
      const segment = this.#stream.segments.get(request.segment.runtimeId);
      if (!segment) continue;

      httpLoading.push(segment.externalId);
    }
    return { loaded, httpLoading };
  }

  #onPeerConnectedWebTorrent = (event: {
    peerId: string;
    channel: RTCDataChannel;
    trackerUrl: string;
    close: (error?: PeerError) => void;
  }) => {
    this.#webtorrentManagerLogger(`peerConnected: peerId=${event.peerId}`);
    if (this.#peersMap.has(event.peerId)) {
      event.close();
      return;
    }

    const peer = new Peer(
      event.peerId,
      event.channel,
      event.close,
      {
        onSegmentRequested: (peer, segmentExternalId, requestId, byteFrom) => {
          this.#onSegmentRequested(
            peer,
            segmentExternalId,
            requestId,
            byteFrom,
          ).catch((error: unknown) => {
            this.#webtorrentManagerLogger(
              `Error in onSegmentRequested ${segmentExternalId} for peer ${peer.id}:`,
              error,
            );
          });
        },
        onSegmentsAnnouncement: this.#onSegmentAnnouncement,
        onWarning: (warning) => {
          this.#onPeerWarning({
            peerId: peer.id,
            infoHash: this.#stream.infoHash,
            streamType: this.#stream.type,
            trackerUrl: event.trackerUrl,
            warning,
          });
        },
      },
      {
        p2pNotReceivingBytesTimeoutMs:
          this.#config.p2pNotReceivingBytesTimeoutMs,
        webRtcMaxMessageSize: this.#config.webRtcMaxMessageSize,
        p2pErrorRetries: this.#config.p2pErrorRetries,
        validateP2PSegment: this.#config.validateP2PSegment,
        streamType: this.#stream.type,
        infoHash: this.#stream.infoHash,
      },
      this.#eventTarget,
    );
    this.#peersMap.set(event.peerId, peer);

    this.#onPeerConnect({
      peerId: event.peerId,
      infoHash: this.#stream.infoHash,
      streamType: this.#stream.type,
      trackerUrl: event.trackerUrl,
    });

    if (this.#config.isP2PUploadDisabled) return;

    const { httpLoading, loaded } = this.#getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
  };

  #onPeerDisconnectedWebTorrent = (
    event: {
      peerId: string;
      trackerUrl: string;
    } & (
      | { error: PeerError; disconnectReason?: never }
      | { error?: never; disconnectReason: string }
    ),
  ) => {
    this.#webtorrentManagerLogger(
      "peerDisconnected: peerId=%s error=%s reason=%s",
      event.peerId,
      event.error?.message,
      event.disconnectReason,
    );

    const peer = this.#peersMap.get(event.peerId);
    if (!peer) return;

    this.#peersMap.delete(event.peerId);
    peer.destroy(true);

    if (event.error) {
      this.#onPeerError({
        peerId: event.peerId,
        infoHash: this.#stream.infoHash,
        streamType: this.#stream.type,
        trackerUrl: event.trackerUrl,
        error: event.error,
      });
    }

    this.#onPeerClose({
      peerId: peer.id,
      infoHash: this.#stream.infoHash,
      streamType: this.#stream.type,
      trackerUrl: event.trackerUrl,
    });
  };

  broadcastAnnouncement = (sendEmptyAnnouncement = false) => {
    if (sendEmptyAnnouncement) {
      this.#sendSegmentsAnnouncement(sendEmptyAnnouncement);
      return;
    }

    if (this.#isAnnounceMicrotaskCreated || this.#config.isP2PUploadDisabled) {
      return;
    }

    this.#sendSegmentsAnnouncement();
  };

  #sendSegmentsAnnouncement = (sendEmptyAnnouncement = false) => {
    this.#isAnnounceMicrotaskCreated = true;

    Utils.queueMicrotask(() => {
      const { loaded = [], httpLoading = [] } = sendEmptyAnnouncement
        ? {}
        : this.#getSegmentsAnnouncement();

      for (const peer of this.#peersMap.values()) {
        peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
      }
      this.#isAnnounceMicrotaskCreated = false;
    });
  };

  #onSegmentRequested = async (
    peer: Peer,
    segmentExternalId: number,
    requestId: number,
    byteFrom?: number,
  ) => {
    const segment = StreamUtils.getSegmentFromStreamByExternalId(
      this.#stream,
      segmentExternalId,
    );
    if (!segment) return;
    if (this.#config.isP2PUploadDisabled) {
      peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
      return;
    }

    let segmentData: ArrayBuffer | undefined;
    try {
      segmentData = await this.#segmentStorage.getSegmentData(
        this.#stream.swarmId,
        this.#stream.streamSwarmId,
        segment.externalId,
      );
    } catch (error) {
      this.#webtorrentManagerLogger(
        `Storage error for segment ${segmentExternalId} requested by peer ${peer.id}:`,
        error,
      );
    }

    const peerClosedWhileAwait = !this.#peersMap.has(peer.id);
    if (peerClosedWhileAwait) return;

    if (!segmentData || segmentData.byteLength === 0) {
      if (segmentData) {
        // Storage handed back a segment with no bytes. Core owns what it
        // stores and never lets a consumer touch it, so this can only be a
        // storage implementation that does not — most likely one whose buffer
        // was detached by a player transmuxing it. Say the segment is absent
        // rather than pass the defect on, and say so loudly: silently seeding
        // nothing looks exactly like having no peers.
        this.#webtorrentManagerLogger(
          `refusing to upload empty segment ${segmentExternalId} to peer ${peer.id}: segment storage returned no bytes`,
        );
      }
      peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
      return;
    }
    this.#uploadedBytes += await peer.uploadSegmentData(
      segment,
      requestId,
      byteFrom !== undefined
        ? new Uint8Array(segmentData).subarray(byteFrom)
        : segmentData,
    );
  };

  /**
   * Closes the connection to a peer whose data an HTTP download found wrong,
   * with the same error type as when its own download finds it: its bytes
   * failed validation, or HTTP contradicted the size it gave.
   */
  closePeerWithBadData(peerId: string, cause: PeerDataFault) {
    this.#peersMap
      .get(peerId)
      ?.destroy(
        false,
        new PeerError(
          cause,
          cause === "validation-failed"
            ? "Its bytes failed validation in a download HTTP finished"
            : "HTTP contradicted the size it gave",
        ),
      );
  }

  /** A segment of this swarm was delivered, over HTTP or P2P. */
  noteDownloadedBytes(bytes: number) {
    this.#downloadedBytes += bytes;
  }

  destroy() {
    diagnostics?.close(this.#diagnosticsToken, "destroyed");
    this.#unprobePeers?.();
    clearTimeout(this.#churnCleanupTimeoutId);
    this.#churnCleanupTimeoutId = undefined;

    this.#eventTarget.removeEventListener(
      `onStorageUpdated-${this.#stream.streamSwarmId}`,
      this.broadcastAnnouncement,
    );

    // webtorrentManager.destroy() internally clears its event target and dispatches
    // synchronous "peerDisconnected" events for active peers. These events trigger
    // our #onPeerDisconnectedWebTorrent handler, which destroys peer wrappers and
    // removes them from #peersMap. We destroy webtorrentManager first to prevent
    // redundant WebRTC connection closing calls during the manual peer cleanup loop.
    this.#webtorrentManager.destroy();

    for (const peer of this.#peersMap.values()) {
      peer.destroy();
    }
    this.#peersMap.clear();
  }
}

/**
 * The segment whose download must stop so that a peer holding all of
 * `segment` can send it: none where such a peer is free, or where no peer
 * holds it; otherwise, all of them busy, the download furthest ahead, as
 * `abortFurthestDownloadFor` chooses. A nearer one is likely the next segment
 * the player asks for, and stopped, its request could become urgent in turn.
 */
export function segmentToStopFor(
  peers: Iterable<
    Pick<Peer, "getSegmentStatus"> & {
      readonly downloadingSegment: SegmentWithStream | undefined;
    }
  >,
  segment: SegmentWithStream,
): SegmentWithStream | undefined {
  let busySegment: SegmentWithStream | undefined;
  for (const peer of peers) {
    if (peer.getSegmentStatus(segment) !== "loaded") continue;
    const downloading = peer.downloadingSegment;
    if (!downloading) return undefined;
    if (!busySegment || downloading.startTime > busySegment.startTime) {
      busySegment = downloading;
    }
  }
  return busySegment;
}

function selectPeerForDownload(peersWithSegment: Peer[]): Peer {
  if (peersWithSegment.length === 1) {
    return peersWithSegment[0];
  }

  let maxSpeed = 0;
  for (const peer of peersWithSegment) {
    const speed = peer.getDownloadBandwidth();
    if (speed > maxSpeed) maxSpeed = speed;
  }

  if (maxSpeed > 0) {
    const baseSpeed = Math.max(1, maxSpeed * 0.1);
    let unprovenPeersCount = 0;
    let provenPeersWeight = 0;

    for (const peer of peersWithSegment) {
      if (peer.getDownloadBandwidth() <= baseSpeed) {
        unprovenPeersCount++;
      } else {
        provenPeersWeight += peer.getDownloadBandwidth();
      }
    }

    let adjustedBaseSpeed = baseSpeed;
    if (
      unprovenPeersCount > 0 &&
      provenPeersWeight > 0 &&
      unprovenPeersCount * baseSpeed > provenPeersWeight
    ) {
      adjustedBaseSpeed = provenPeersWeight / unprovenPeersCount;
    }

    return Utils.getWeightedRandomItem(peersWithSegment, (peer) =>
      Math.max(peer.getDownloadBandwidth(), adjustedBaseSpeed),
    );
  } else {
    return Utils.getRandomItem(peersWithSegment);
  }
}
