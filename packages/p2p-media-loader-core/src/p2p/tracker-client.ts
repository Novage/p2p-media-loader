import TrackerClient, {
  PeerConnection,
  TrackerClientEvents,
} from "bittorrent-tracker";
import { CoreEventMap, CoreConfig, StreamWithSegments } from "../types";
import debug from "debug";
import * as PeerUtil from "../utils/peer";
import * as LoggerUtils from "../utils/logger";
import { Peer } from "./peer";
import { EventEmitter } from "../utils/event-emitter";

type PeerItem = {
  peer?: Peer;
  potentialConnections: Set<PeerConnection>;
};
type P2PTrackerClientEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentExternalId: number) => void;
};

export class P2PTrackerClient {
  private readonly peerId: string;
  private readonly streamShortId: string;
  private readonly client: TrackerClient;
  private readonly _peers = new Map<string, PeerItem>();
  private readonly logger = debug("core:p2p-tracker-client");

  constructor(
    streamId: string,
    stream: StreamWithSegments,
    private readonly eventHandlers: P2PTrackerClientEventHandlers,
    private readonly config: CoreConfig,
    private readonly eventEmmiter: EventEmitter<CoreEventMap>,
    private readonly customPeerId?: string,
  ) {
    const { string: peerId, bytes: peerIdBytes } =
      PeerUtil.generatePeerId(customPeerId);
    const { bytes: streamIdBytes, string: streamHash } =
      PeerUtil.getStreamHash(streamId);
    this.peerId = peerId;
    this.streamShortId = LoggerUtils.getStreamString(stream);

    this.client = new TrackerClient({
      infoHash: streamIdBytes,
      peerId: peerIdBytes,
      port: 6881,
      announce: this.config.announceTrackers ?? [
        // "wss://tracker.novage.com.ua",
        "wss://tracker.webtorrent.dev",
        "wss://tracker.files.fm:7073/announce",
        "wss://tracker.openwebtorrent.com",
      ],
      rtcConfig: {
        iceServers: this.config.rtcConfig?.iceServers ?? [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
        ...this.config.rtcConfig,
      },
    });
    this.client.on("peer", this.onReceivePeerConnection);
    this.client.on("warning", this.onTrackerClientWarning);
    this.client.on("error", this.onTrackerClientError);
    this.logger(
      `create new client; \nstream: ${this.streamShortId}; hash: ${streamHash}; \npeer id: ${this.peerId}`,
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
        },
        this.config,
        this.eventEmmiter,
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
  };

  private onTrackerClientError: TrackerClientEvents["error"] = (error) => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    this.logger(`tracker error (${this.streamShortId}: ${error})`);
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
