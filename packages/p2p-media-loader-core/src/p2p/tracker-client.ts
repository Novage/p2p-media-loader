import TrackerClient, {
  PeerConnection,
  TrackerClientEvents,
} from "bittorrent-tracker";
import { Settings, StreamWithSegments } from "../types";
import debug from "debug";
import * as PeerUtil from "../utils/peer";
import * as LoggerUtils from "../utils/logger";
import { Peer } from "./peer";

type PeerItem = {
  peer?: Peer;
  potentialConnections: Set<PeerConnection>;
};
type P2PTrackerClientEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentExternalId: string) => void;
};

export class P2PTrackerClient {
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
