import TrackerClient, {
  PeerConnection,
  TrackerClientEvents,
} from "bittorrent-tracker";
import { CoreEventMap, StreamConfig, StreamWithSegments } from "../types.js";
import debug from "debug";
import * as PeerUtil from "../utils/peer.js";
import * as LoggerUtils from "../utils/logger.js";
import { Peer } from "./peer.js";
import { EventTarget } from "../utils/event-target.js";
import { utf8ToUintArray } from "../utils/utils.js";

type PeerItem = {
  peer?: Peer;
  potentialConnections: Set<PeerConnection>;
};

type P2PTrackerClientEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (
    peer: Peer,
    segmentExternalId: number,
    requestId: number,
    bytesFrom?: number,
  ) => void;
  onSegmentsAnnouncement: () => void;
};

function isSafariOrWkWebview() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isWkWebview =
    /\b(iPad|iPhone|Macintosh).*AppleWebKit(?!.*Safari)/i.test(
      navigator.userAgent,
    );

  return isSafari || isWkWebview;
}

export class P2PTrackerClient {
  private readonly streamShortId: string;
  private readonly client: TrackerClient;
  private readonly _peers = new Map<string, PeerItem>();
  private readonly logger = debug("p2pml-core:p2p-tracker-client");

  constructor(
    streamSwarmId: string,
    private readonly stream: StreamWithSegments,
    private readonly eventHandlers: P2PTrackerClientEventHandlers,
    private readonly config: StreamConfig,
    private readonly eventTarget: EventTarget<CoreEventMap>,
  ) {
    const streamHash = PeerUtil.getStreamHash(streamSwarmId);
    this.streamShortId = LoggerUtils.getStreamString(stream);

    const peerId = PeerUtil.generatePeerId(config.trackerClientVersionPrefix);

    this.client = new TrackerClient({
      infoHash: utf8ToUintArray(streamHash),
      peerId: utf8ToUintArray(peerId),
      announce: isSafariOrWkWebview()
        ? config.announceTrackers.slice(0, 1) // Safari has issues with multiple trackers
        : config.announceTrackers,
      rtcConfig: this.config.rtcConfig,
    });
    this.client.on("peer", this.onReceivePeerConnection);
    this.client.on("warning", this.onTrackerClientWarning);
    this.client.on("error", this.onTrackerClientError);
    this.logger(
      `create new client; \nstream: ${this.streamShortId}; hash: ${streamHash}\npeerId: ${peerId}`,
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
    this._peers.clear();
    this.logger(`destroy client; stream: ${this.streamShortId}`);
  }

  private onReceivePeerConnection: TrackerClientEvents["peer"] = (
    peerConnection,
  ) => {
    const itemId = Peer.getPeerIdFromConnection(peerConnection);
    let peerItem = this._peers.get(itemId);
    if (peerItem?.peer) {
      peerConnection.destroy();
      return;
    } else if (!peerItem) {
      peerItem = { potentialConnections: new Set() };
      peerConnection.idUtf8 = itemId;
      peerItem.potentialConnections.add(peerConnection);
      this._peers.set(itemId, peerItem);
    }

    peerConnection.on("connect", () => {
      if (!peerItem || peerItem.peer) return;

      for (const connection of peerItem.potentialConnections) {
        if (connection !== peerConnection) connection.destroy();
      }
      peerItem.potentialConnections.clear();
      peerItem.peer = new Peer(
        peerConnection,
        {
          onPeerClosed: this.onPeerClosed,
          onSegmentRequested: this.eventHandlers.onSegmentRequested,
          onSegmentsAnnouncement: this.eventHandlers.onSegmentsAnnouncement,
        },
        this.config,
        this.stream.type,
        this.eventTarget,
      );
      this.logger(
        `connected with peer: ${peerItem.peer.id} ${this.streamShortId}`,
      );
      this.eventHandlers.onPeerConnected(peerItem.peer);
    });
  };

  private onTrackerClientWarning: TrackerClientEvents["warning"] = (
    warning,
  ) => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    this.logger(`tracker warning (${this.streamShortId}: ${warning})`);
    this.eventTarget.getEventDispatcher("onTrackerWarning")({
      streamType: this.stream.type,
      warning,
    });
  };

  private onTrackerClientError: TrackerClientEvents["error"] = (error) => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    this.logger(`tracker error (${this.streamShortId}: ${error})`);
    this.eventTarget.getEventDispatcher("onTrackerError")({
      streamType: this.stream.type,
      error,
    });
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
