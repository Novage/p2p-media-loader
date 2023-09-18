import TrackerClient, { TrackerEventHandler } from "bittorrent-tracker";
import * as RIPEMD160 from "ripemd160";
import { Peer } from "./peer";
import * as PeerUtil from "./peer-utils";
import { Segment } from "./types";
import { JsonSegmentAnnouncementMap } from "./internal-types";

export class P2PLoader {
  private readonly streamExternalId: string;
  private readonly streamHash: string;
  private readonly peerHash: string;
  private trackerClient: TrackerClient;
  private readonly peers = new Map<string, Peer>();
  private announcementMap: JsonSegmentAnnouncementMap = {};

  constructor(streamExternalId: string) {
    this.streamExternalId = streamExternalId;
    const peerId = PeerUtil.generatePeerId();
    this.streamHash = getHash(this.streamExternalId);
    this.peerHash = getHash(peerId);

    this.trackerClient = new TrackerClient({
      infoHash: this.streamHash,
      peerId: this.peerHash,
      port: 6881,
      announce: [
        "wss://tracker.novage.com.ua",
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

    this.trackerClient.on("update", this.onTrackerUpdate);
    this.trackerClient.on("peer", this.onTrackerPeerConnect);
    this.trackerClient.on("warning", this.onTrackerWarning);
    this.trackerClient.on("error", this.onTrackerError);

    this.trackerClient.start();
  }

  private onTrackerUpdate: TrackerEventHandler<"update"> = (data) => {};
  private onTrackerPeerConnect: TrackerEventHandler<"peer"> = (candidate) => {
    const peer = this.peers.get(candidate.id);
    if (peer) {
      peer.addCandidate(candidate);
    } else {
      const peer = new Peer(this.streamExternalId, candidate);
      this.peers.set(candidate.id, peer);
    }
  };
  private onTrackerWarning: TrackerEventHandler<"warning"> = (warning) => {};
  private onTrackerError: TrackerEventHandler<"error"> = (error) => {};

  updateSegmentsLoadingState(loaded: Segment[], loading: Segment[]) {
    this.announcementMap = PeerUtil.getJsonSegmentsAnnouncementMap(
      this.streamExternalId,
      loaded,
      loading
    );
    this.broadcastSegmentAnnouncement();
  }

  sendSegmentsAnnouncementToPeer(peer: Peer) {
    if (!peer?.isConnected) return;
    peer.sendSegmentsAnnouncement(this.announcementMap);
  }

  broadcastSegmentAnnouncement() {
    for (const peer of this.peers.values()) {
      this.sendSegmentsAnnouncementToPeer(peer);
    }
  }
}

function getHash(data: string) {
  return new RIPEMD160().update(data).digest("hex");
}
