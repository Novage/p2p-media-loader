import { Peer } from "./peer.js";
import {
  CoreEventMap,
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

export class P2PLoader {
  private static readonly PEER_ID_BY_INFO_HASH = new Map<string, string>();
  private readonly webtorrentManager: WebTorrentManager;
  private readonly peersMap = new Map<string, Peer>();
  private readonly swarmId: string;
  private readonly streamSwarmId: string;
  private isAnnounceMicrotaskCreated = false;
  private readonly webtorrentManagerLogger = debug(
    "p2pml-core:webtorrent-manager",
  );

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentStorage,
    private readonly config: StreamConfig,
    private readonly webTorrentSocketPool: WebTorrentSocketPool,
    private readonly eventTarget: EventTarget<EventTargetMap>,
    private readonly onSegmentAnnouncement: () => void,
  ) {
    this.swarmId = this.config.swarmId ?? this.streamManifestUrl;
    this.streamSwarmId = StreamUtils.getStreamSwarmId(
      this.swarmId,
      this.stream,
    );

    const streamHash = PeerUtil.getStreamHash(this.streamSwarmId);
    let peerId = P2PLoader.PEER_ID_BY_INFO_HASH.get(streamHash);
    if (!peerId) {
      peerId = PeerUtil.generatePeerId(this.config.trackerClientVersionPrefix);
      P2PLoader.PEER_ID_BY_INFO_HASH.set(streamHash, peerId);
    }

    this.webtorrentManager = new WebTorrentManager({
      infoHash: streamHash,
      peerId,
      trackerUrls: this.config.announceTrackers,
      rtcConfig: this.config.rtcConfig,
      socketPool: this.webTorrentSocketPool,
    });

    this.webtorrentManager.addEventListener(
      "peerConnected",
      this.onPeerConnectedWebTorrent,
    );

    this.webtorrentManager.addEventListener(
      "peerDisconnected",
      this.onPeerDisconnectedWebTorrent,
    );

    this.webtorrentManager.addEventListener("peerConnectFailed", (event) => {
      this.webtorrentManagerLogger(
        `Peer connection failed (${event.peerId}) from tracker ${event.trackerUrl}:`,
        event.error,
      );
      this.eventTarget.getEventDispatcher("onPeerError")({
        peerId: event.peerId,
        streamType: this.stream.type,
        error: new Error(event.error),
      });
    });

    this.webtorrentManager.addEventListener("warning", (event) => {
      this.webtorrentManagerLogger(
        `Tracker warning (${event.trackerUrl}):`,
        event.warning,
      );
      this.eventTarget.getEventDispatcher("onTrackerWarning")({
        streamType: this.stream.type,
        warning: new Error(event.warning),
      });
    });

    this.webtorrentManager.addEventListener("error", (event) => {
      this.webtorrentManagerLogger(
        `Tracker error (${event.trackerUrl}):`,
        event.error,
      );
      this.eventTarget.getEventDispatcher("onTrackerError")({
        streamType: this.stream.type,
        error: new Error(event.error),
      });
    });

    this.eventTarget.addEventListener(
      `onStorageUpdated-${this.streamSwarmId}`,
      this.broadcastAnnouncement,
    );

    this.webtorrentManager.start();
  }

  downloadSegment(segment: SegmentWithStream) {
    const peersWithSegment: Peer[] = [];
    for (const peer of this.peersMap.values()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === "loaded"
      ) {
        peersWithSegment.push(peer);
      }
    }

    if (peersWithSegment.length === 0) return;

    let selectedPeer: Peer;

    if (peersWithSegment.length === 1) {
      selectedPeer = peersWithSegment[0];
    } else {
      let maxSpeed = 0;
      for (const peer of peersWithSegment) {
        const speed = peer.downloadBandwidth;
        if (speed > maxSpeed) maxSpeed = speed;
      }

      if (maxSpeed > 0) {
        const baseSpeed = Math.max(1, maxSpeed * 0.1);
        let unprovenPeersCount = 0;
        let provenPeersWeight = 0;

        for (const peer of peersWithSegment) {
          if (peer.downloadBandwidth <= baseSpeed) {
            unprovenPeersCount++;
          } else {
            provenPeersWeight += peer.downloadBandwidth;
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

        selectedPeer = Utils.getWeightedRandomItem(peersWithSegment, (peer) =>
          Math.max(peer.downloadBandwidth, adjustedBaseSpeed),
        );
      } else {
        selectedPeer = Utils.getRandomItem(peersWithSegment);
      }
    }

    const request = this.requests.getOrCreateRequest(segment);
    selectedPeer.downloadSegment(request);
  }

  isSegmentLoadingOrLoadedBySomeone(segment: SegmentWithStream): boolean {
    for (const peer of this.peersMap.values()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  isSegmentLoadedBySomeone(segment: SegmentWithStream): boolean {
    for (const peer of this.peersMap.values()) {
      if (peer.getSegmentStatus(segment) === "loaded") return true;
    }
    return false;
  }

  get connectedPeerCount() {
    return this.peersMap.size;
  }

  *peers() {
    for (const peer of this.peersMap.values()) {
      yield peer;
    }
  }

  private getSegmentsAnnouncement() {
    const loaded: number[] = this.segmentStorage.getStoredSegmentIds(
      this.swarmId,
      this.streamSwarmId,
    );
    const httpLoading: number[] = [];

    for (const request of this.requests.httpRequests()) {
      const segment = this.stream.segments.get(request.segment.runtimeId);
      if (!segment) continue;

      httpLoading.push(segment.externalId);
    }
    return { loaded, httpLoading };
  }

  private onPeerConnectedWebTorrent = (event: {
    peerId: string;
    channel: RTCDataChannel;
    close: (error?: string) => void;
  }) => {
    this.webtorrentManagerLogger(`peerConnected: peerId=${event.peerId}`);
    if (this.peersMap.has(event.peerId)) {
      event.close();
      return;
    }

    const peer = new Peer(
      event.peerId,
      event.channel,
      event.close,
      {
        onSegmentRequested: (peer, segmentExternalId, requestId, byteFrom) => {
          this.onSegmentRequested(
            peer,
            segmentExternalId,
            requestId,
            byteFrom,
          ).catch((error: unknown) => {
            this.webtorrentManagerLogger(
              `Error in onSegmentRequested ${segmentExternalId} for peer ${peer.id}:`,
              error,
            );
          });
        },
        onSegmentsAnnouncement: this.onSegmentAnnouncement,
      },
      this.config,
      this.eventTarget,
    );
    this.peersMap.set(event.peerId, peer);

    this.eventTarget.getEventDispatcher("onPeerConnect")({
      peerId: event.peerId,
      streamType: this.stream.type,
    });

    if (this.config.isP2PUploadDisabled) return;

    const { httpLoading, loaded } = this.getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
  };

  private onPeerDisconnectedWebTorrent = (event: {
    peerId: string;
    reason: string;
    isError: boolean;
  }) => {
    this.webtorrentManagerLogger(
      `peerDisconnected: peerId=${event.peerId} reason=${event.reason} isError=${event.isError}`,
    );

    const peer = this.peersMap.get(event.peerId);
    if (!peer) return;

    this.peersMap.delete(event.peerId);
    peer.destroy(true);

    if (event.isError) {
      this.eventTarget.getEventDispatcher("onPeerError")({
        peerId: event.peerId,
        streamType: this.stream.type,
        error: new Error(event.reason),
      });
    }

    this.eventTarget.getEventDispatcher("onPeerClose")({
      peerId: peer.id,
      streamType: this.stream.type,
    });
  };

  broadcastAnnouncement = (sendEmptyAnnouncement = false) => {
    if (sendEmptyAnnouncement) {
      this.sendSegmentsAnnouncement(sendEmptyAnnouncement);
      return;
    }

    if (this.isAnnounceMicrotaskCreated || this.config.isP2PUploadDisabled) {
      return;
    }

    this.sendSegmentsAnnouncement();
  };

  private sendSegmentsAnnouncement = (sendEmptyAnnouncement = false) => {
    this.isAnnounceMicrotaskCreated = true;

    queueMicrotask(() => {
      const { loaded = [], httpLoading = [] } = sendEmptyAnnouncement
        ? {}
        : this.getSegmentsAnnouncement();

      for (const peer of this.peersMap.values()) {
        peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
      }
      this.isAnnounceMicrotaskCreated = false;
    });
  };

  private onSegmentRequested = async (
    peer: Peer,
    segmentExternalId: number,
    requestId: number,
    byteFrom?: number,
  ) => {
    const segment = StreamUtils.getSegmentFromStreamByExternalId(
      this.stream,
      segmentExternalId,
    );
    if (!segment) return;
    if (this.config.isP2PUploadDisabled) {
      peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
      return;
    }

    let segmentData: ArrayBuffer | undefined;
    try {
      segmentData = await this.segmentStorage.getSegmentData(
        this.swarmId,
        this.streamSwarmId,
        segment.externalId,
      );
    } catch (error) {
      this.webtorrentManagerLogger(
        `Storage error for segment ${segmentExternalId} requested by peer ${peer.id}:`,
        error,
      );
    }

    const peerClosedWhileAwait = !this.peersMap.has(peer.id);
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
    this.eventTarget.removeEventListener(
      `onStorageUpdated-${this.streamSwarmId}`,
      this.broadcastAnnouncement,
    );

    for (const peer of this.peersMap.values()) {
      peer.destroy();
    }
    this.peersMap.clear();

    this.webtorrentManager.destroy();
  }
}
