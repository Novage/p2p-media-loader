import TrackerClient, {
  PeerConnection,
  TrackerClientEvents,
} from "bittorrent-tracker";
import { Peer } from "./peer";
import * as PeerUtil from "../utils/peer";
import { Segment, Settings, StreamWithSegments } from "../types";
import { QueueItem } from "../internal-types";
import { SegmentsMemoryStorage } from "../segments-storage";
import * as LoggerUtils from "../utils/logger";
import * as StreamUtils from "../utils/stream";
import * as Utils from "../utils/utils";
import { PeerSegmentStatus } from "../enums";
import { RequestsContainer } from "../request-container";
import { Request } from "../request";
import debug from "debug";

export class P2PLoader {
  private readonly peerId: string;
  private readonly trackerClient: P2PTrackerClient;
  private readonly logger = debug("core:p2p-loader");
  private isAnnounceMicrotaskCreated = false;

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly settings: Settings
  ) {
    this.peerId = PeerUtil.generatePeerId();
    const streamExternalId = StreamUtils.getStreamExternalId(
      this.streamManifestUrl,
      this.stream
    );
    this.trackerClient = new P2PTrackerClient(
      this.peerId,
      streamExternalId,
      this.stream,
      {
        onPeerConnected: this.onPeerConnected,
        onSegmentRequested: this.onSegmentRequested,
      },
      this.settings,
      this.logger
    );

    this.segmentStorage.subscribeOnUpdate(
      this.stream,
      this.broadcastAnnouncement
    );
    // this.requests.subscribeOnHttpRequestsUpdate(this.broadcastAnnouncement);
    this.trackerClient.start();
  }

  downloadSegment(item: QueueItem): Request | undefined {
    const { segment, statuses } = item;
    const untestedPeers: Peer[] = [];
    let fastestPeer: Peer | undefined;
    let fastestPeerBandwidth = 0;

    for (const peer of this.trackerClient.peers()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === PeerSegmentStatus.Loaded
      ) {
        const { bandwidth } = peer;
        if (bandwidth === undefined) {
          untestedPeers.push(peer);
        } else if (bandwidth > fastestPeerBandwidth) {
          fastestPeerBandwidth = bandwidth;
          fastestPeer = peer;
        }
      }
    }

    const peer = untestedPeers.length
      ? Utils.getRandomItem(untestedPeers)
      : fastestPeer;

    if (!peer) return;

    const request = this.requests.getOrCreateRequest(segment);
    peer.fulfillSegmentRequest(request);
    this.logger(
      `p2p request ${segment.externalId} | ${LoggerUtils.getStatusesString(
        statuses
      )}`
    );
    request.subscribe("onCompleted", () => {
      this.logger(`p2p loaded: ${segment.externalId}`);
    });

    return request;
  }

  isLoadingOrLoadedBySomeone(segment: Segment): boolean {
    for (const peer of this.trackerClient.peers()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  get connectedPeersAmount() {
    let count = 0;
    for (const peer of this.trackerClient.peers()) count++;
    return count;
  }

  private getSegmentsAnnouncement() {
    const loaded: string[] =
      this.segmentStorage.getStoredSegmentExternalIdsOfStream(this.stream);
    const httpLoading: string[] = [];

    for (const request of this.requests.httpRequests()) {
      const segment = this.stream.segments.get(request.segment.localId);
      if (!segment) continue;

      httpLoading.push(segment.externalId);
    }
    return PeerUtil.getJsonSegmentsAnnouncement(loaded, httpLoading);
  }

  private onPeerConnected(peer: Peer) {
    this.logger(`connected with peer: ${peer.id}`);
    const announcement = this.getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncement(announcement);
  }

  private broadcastAnnouncement = () => {
    if (this.isAnnounceMicrotaskCreated) return;

    this.isAnnounceMicrotaskCreated = true;
    queueMicrotask(() => {
      const announcement = this.getSegmentsAnnouncement();
      for (const peer of this.trackerClient.peers()) {
        peer.sendSegmentsAnnouncement(announcement);
      }
      this.isAnnounceMicrotaskCreated = false;
    });
  };

  private async onSegmentRequested(peer: Peer, segmentExternalId: string) {
    const segment = StreamUtils.getSegmentFromStreamByExternalId(
      this.stream,
      segmentExternalId
    );
    const segmentData =
      segment && (await this.segmentStorage.getSegmentData(segment));
    if (segmentData) void peer.sendSegmentData(segmentExternalId, segmentData);
    else peer.sendSegmentAbsent(segmentExternalId);
  }

  destroy() {
    this.logger(
      `destroy tracker client: ${LoggerUtils.getStreamString(this.stream)}`
    );
    this.segmentStorage.unsubscribeFromUpdate(
      this.stream,
      this.broadcastAnnouncement
    );
    // this.requests.unsubscribeFromHttpRequestsUpdate(this.broadcastAnnouncement);
    this.trackerClient.destroy();
  }
}

type PeerItem = { peer?: Peer; potentialConnections: Set<PeerConnection> };

type P2PTrackerClientEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentExternalId: string) => void;
};

class P2PTrackerClient {
  private readonly client: TrackerClient;
  private readonly _peers = new Map<string, PeerItem>();
  private readonly streamHash: string;

  constructor(
    private readonly peerId: string,
    private readonly streamExternalId: string,
    private readonly stream: StreamWithSegments,
    private readonly eventHandlers: P2PTrackerClientEventHandlers,
    private readonly settings: Settings,
    private readonly logger: debug.Debugger
  ) {
    this.streamHash = PeerUtil.getStreamHash(streamExternalId);
    this.client = new TrackerClient({
      infoHash: utf8ToHex(this.streamHash),
      peerId: utf8ToHex(this.peerId),
      port: 6881,
      announce: [
        // "wss://tracker.novage.com.ua",
        "wss://tracker.openwebtorrent.com",
      ],
      rtcConfig: {
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
        ],
      },
    });
    this.client.on("peer", this.onReceivePeerConnection);
    this.client.on("warning", this.onTrackerClientWarning);
    this.client.on("error", this.onTrackerClientError);
    this.logger(
      `create tracker client: ${LoggerUtils.getStreamString(stream)}; ${
        this.peerId
      }`
    );
  }

  start() {
    this.client.start();
  }

  destroy() {
    this.client.destroy();
    for (const { peer, potentialConnections } of this._peers.values()) {
      peer?.destroy();
      for (const connection of potentialConnections) {
        connection.destroy();
      }
    }
  }

  private onReceivePeerConnection: TrackerClientEvents["peer"] = (
    peerConnection
  ) => {
    let peerItem = this._peers.get(peerConnection.id);

    if (peerItem?.peer) {
      peerConnection.destroy();
      return;
    } else if (!peerItem) {
      peerItem = { potentialConnections: new Set() };
      peerItem.potentialConnections.add(peerConnection);
      const itemId = Peer.getPeerIdFromHexString(peerConnection.id);
      this._peers.set(itemId, peerItem);
    }

    peerConnection.on("connect", () => {
      if (!peerItem) return;

      for (const connection of peerItem.potentialConnections) {
        if (connection !== peerConnection) connection.destroy();
      }
      peerItem.potentialConnections.clear();
      peerItem.peer = new Peer(
        peerConnection,
        {
          onPeerClosed: this.onPeerClosed,
          onSegmentRequested: this.eventHandlers.onSegmentRequested,
        },
        this.settings
      );
      this.eventHandlers.onPeerConnected(peerItem.peer);
    });
  };

  private onTrackerClientWarning: TrackerClientEvents["warning"] = (
    warning
  ) => {
    this.logger(
      `tracker warning (${LoggerUtils.getStreamString(
        this.stream
      )}: ${warning})`
    );
  };

  private onTrackerClientError: TrackerClientEvents["error"] = (error) => {
    this.logger(
      `tracker error (${LoggerUtils.getStreamString(this.stream)}: ${error})`
    );
  };

  *peers() {
    for (const peerItem of this._peers.values()) {
      if (peerItem?.peer) yield peerItem.peer;
    }
  }

  private onPeerClosed = (peer: Peer) => {
    this.logger(`peer closed: ${peer.id}`);
    this._peers.delete(peer.id);
  };
}

function utf8ToHex(utf8String: string) {
  let result = "";
  for (let i = 0; i < utf8String.length; i++) {
    result += utf8String.charCodeAt(i).toString(16);
  }

  return result;
}
