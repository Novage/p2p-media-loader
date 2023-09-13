import TrackerClient, { TrackerEventHandler } from "bittorrent-tracker";
import * as RIPEMD160 from "ripemd160";
import { Peer } from "./peer";
import * as PeerUtil from "./peer-utils";

export class P2PLoader {
  private streamId?: string;
  private streamHash?: string;
  private peerHash?: string;
  private trackerClient?: TrackerClient;
  private readonly peers = new Map<string, Peer>();

  setStreamId(streamId: string) {
    if (this.streamId === streamId) return;

    this.streamId = streamId;
    const peerId = PeerUtil.generatePeerId();
    this.streamHash = getHash(streamId);
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
    if (peer) peer.addCandidate(candidate);
    else this.peers.set(candidate.id, new Peer(candidate));
  };
  private onTrackerWarning: TrackerEventHandler<"warning"> = (warning) => {};
  private onTrackerError: TrackerEventHandler<"error"> = (error) => {};
}

function getHash(data: string) {
  return new RIPEMD160().update(data).digest("hex");
}
