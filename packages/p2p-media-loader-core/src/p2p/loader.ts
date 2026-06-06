import { Peer } from "./peer.js";
import {
  CoreEventMap,
  PeerError,
  SegmentWithStream,
  StreamConfig,
  StreamWithSegments,
} from "../types.js";
import { RequestsContainer } from "../requests/request-container.js";
import { WebTorrentManager } from "../webtorrent/webtorrent-manager/index.js";
import { WebTorrentSocketPool } from "../webtorrent/webtorrent-socket-pool/index.js";
import * as StreamUtils from "../utils/stream.js";
import * as Utils from "../utils/utils.js";
import * as PeerUtil from "../utils/peer.js";
import { EventTarget } from "../utils/event-target.js";
import { SegmentStorage } from "../segment-storage/index.js";
import debug from "debug";

export type EventTargetMap = Record<`onStorageUpdated-${string}`, () => void> &
  CoreEventMap;

const MIN_CHURN_CLEANUP_INTERVAL_MS = 1000;

export class P2PLoader {
  readonly #webtorrentManager: WebTorrentManager;
  readonly #peersMap = new Map<string, Peer>();
  readonly #swarmId: string;
  readonly #streamSwarmId: string;
  #isAnnounceMicrotaskCreated = false;
  readonly #webtorrentManagerLogger = debug("p2pml-core:webtorrent-manager");
  readonly #churnLogger = debug("p2pml-core:churn-cleanup");

  readonly #infoHash: string;
  #streamManifestUrl: string;
  readonly #stream: StreamWithSegments;
  readonly #requests: RequestsContainer;
  readonly #segmentStorage: SegmentStorage;
  readonly #config: StreamConfig;
  readonly #webTorrentSocketPool: WebTorrentSocketPool;
  readonly #eventTarget: EventTarget<EventTargetMap>;
  readonly #onSegmentAnnouncement: () => void;
  #churnCleanupTimeoutId?: ReturnType<typeof setTimeout>;

  readonly #onPeerConnect: CoreEventMap["onPeerConnect"];
  readonly #onPeerConnectError: CoreEventMap["onPeerConnectError"];
  readonly #onPeerClose: CoreEventMap["onPeerClose"];
  readonly #onPeerError: CoreEventMap["onPeerError"];
  readonly #onPeerWarning: CoreEventMap["onPeerWarning"];
  readonly #onTrackerWarning: CoreEventMap["onTrackerWarning"];
  readonly #onTrackerError: CoreEventMap["onTrackerError"];

  constructor(
    streamManifestUrl: string,
    stream: StreamWithSegments,
    requests: RequestsContainer,
    segmentStorage: SegmentStorage,
    config: StreamConfig,
    webTorrentSocketPool: WebTorrentSocketPool,
    eventTarget: EventTarget<EventTargetMap>,
    peerId: string,
    onSegmentAnnouncement: () => void,
  ) {
    this.#streamManifestUrl = streamManifestUrl;
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

    this.#swarmId = this.#config.swarmId ?? this.#streamManifestUrl;
    this.#streamSwarmId = StreamUtils.getStreamSwarmId(
      this.#swarmId,
      this.#stream,
    );

    const streamHash = PeerUtil.getStreamHash(this.#streamSwarmId);
    this.#infoHash = streamHash;

    this.#webtorrentManager = new WebTorrentManager({
      infoHash: streamHash,
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
        infoHash: this.#infoHash,
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
        infoHash: this.#infoHash,
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
        infoHash: this.#infoHash,
        streamType: this.#stream.type,
        error: event.error,
      });
    });

    this.#eventTarget.addEventListener(
      `onStorageUpdated-${this.#streamSwarmId}`,
      this.broadcastAnnouncement,
    );

    this.#webtorrentManager.start();

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

  downloadSegment(segment: SegmentWithStream) {
    const peersWithSegment: Peer[] = [];
    for (const peer of this.#peersMap.values()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === "loaded"
      ) {
        peersWithSegment.push(peer);
      }
    }

    if (peersWithSegment.length === 0) return;

    const selectedPeer = selectPeerForDownload(peersWithSegment);

    const request = this.#requests.getOrCreateRequest(segment);
    selectedPeer.downloadSegment(request);
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
      this.#swarmId,
      this.#streamSwarmId,
    );
    const httpLoading: number[] = [];

    for (const request of this.#requests.httpRequests()) {
      const segment = this.#stream.segments.get(request.segment.runtimeId);
      if (!segment) continue;

      httpLoading.push(segment.externalId);
    }
    return { loaded, httpLoading };
  }

  #onPeerConnectedWebTorrent = (event: {
    peerId: string;
    channel: RTCDataChannel;
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
            infoHash: this.#infoHash,
            streamType: this.#stream.type,
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
        infoHash: this.#infoHash,
      },
      this.#eventTarget,
    );
    this.#peersMap.set(event.peerId, peer);

    this.#onPeerConnect({
      peerId: event.peerId,
      infoHash: this.#infoHash,
      streamType: this.#stream.type,
    });

    if (this.#config.isP2PUploadDisabled) return;

    const { httpLoading, loaded } = this.#getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
  };

  #onPeerDisconnectedWebTorrent = (
    event: {
      peerId: string;
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
        infoHash: this.#infoHash,
        streamType: this.#stream.type,
        error: event.error,
      });
    }

    this.#onPeerClose({
      peerId: peer.id,
      infoHash: this.#infoHash,
      streamType: this.#stream.type,
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
        this.#swarmId,
        this.#streamSwarmId,
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

    if (!segmentData) {
      peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
      return;
    }
    await peer.uploadSegmentData(
      segment,
      requestId,
      byteFrom !== undefined
        ? new Uint8Array(segmentData).subarray(byteFrom)
        : segmentData,
    );
  };

  destroy() {
    clearTimeout(this.#churnCleanupTimeoutId);
    this.#churnCleanupTimeoutId = undefined;

    this.#eventTarget.removeEventListener(
      `onStorageUpdated-${this.#streamSwarmId}`,
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

export function selectPeerForDownload(peersWithSegment: Peer[]): Peer {
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
