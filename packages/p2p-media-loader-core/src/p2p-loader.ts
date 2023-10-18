import TrackerClient, { PeerConnection } from "bittorrent-tracker";
import { Peer } from "./peer";
import * as PeerUtil from "./utils/peer-utils";
import { Segment, Settings, StreamWithSegments } from "./types";
import { JsonSegmentAnnouncement, QueueItem } from "./internal-types";
import { SegmentsMemoryStorage } from "./segments-storage";
import * as Utils from "./utils/utils";
import * as LoggerUtils from "./utils/logger";
import { PeerSegmentStatus } from "./enums";
import { RequestContainer } from "./request";
import debug from "debug";
import { windows } from "rimraf";

export class P2PLoader {
  private readonly streamExternalId: string;
  private readonly peerId: string;
  private readonly trackerClient: TrackerClient;
  private readonly peers = new Map<string, Peer>();
  private announcement: JsonSegmentAnnouncement = { i: "" };
  private readonly logger = debug("core:p2p-loader");
  private broadcastAnnouncementTaskId?: number;

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestContainer,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly settings: Settings
  ) {
    this.peerId = PeerUtil.generatePeerId();
    this.streamExternalId = Utils.getStreamExternalId(
      this.streamManifestUrl,
      this.stream
    );

    this.trackerClient = createTrackerClient({
      streamHash: utf8ToHex(this.streamExternalId),
      peerHash: utf8ToHex(this.peerId),
    });
    this.logger(
      `create tracker client: ${LoggerUtils.getStreamString(stream)}; ${
        this.peerId
      }`
    );
    this.subscribeOnTrackerEvents(this.trackerClient);
    this.segmentStorage.subscribeOnUpdate(
      this.stream,
      this.updateAndBroadcastAnnouncement
    );
    this.requests.subscribeOnHttpRequestsUpdate(
      this.updateAndBroadcastAnnouncement
    );
    this.updateSegmentAnnouncement();
    this.trackerClient.start();
  }

  private subscribeOnTrackerEvents(trackerClient: TrackerClient) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    trackerClient.on("update", (data) => {});
    trackerClient.on("peer", (peerConnection) => {
      console.log(peerConnection);
      const peer = this.peers.get(peerConnection.id);
      if (peer) peer.setConnection(peerConnection);
      else this.createPeer(peerConnection);
    });
    trackerClient.on("warning", (warning) => {
      this.logger(
        `tracker warning (${LoggerUtils.getStreamString(
          this.stream
        )}: ${warning})`
      );
    });
    trackerClient.on("error", (error) => {
      this.logger(
        `tracker error (${LoggerUtils.getStreamString(this.stream)}: ${error})`
      );
    });
  }

  private createPeer(connection: PeerConnection) {
    const peer = new Peer(
      connection,
      {
        onPeerConnected: this.onPeerConnected.bind(this),
        onPeerClosed: this.onPeerClosed.bind(this),
        onSegmentRequested: this.onSegmentRequested.bind(this),
      },
      this.settings
    );
    this.logger(`create new peer: ${peer.id}`);
    this.peers.set(connection.id, peer);
  }

  async downloadSegment(item: QueueItem): Promise<ArrayBuffer | undefined> {
    const { segment, statuses } = item;
    const untestedPeers: Peer[] = [];
    let fastestPeer: Peer | undefined;
    let fastedPeerBandwidth = 0;

    for (const peer of this.peers.values()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === PeerSegmentStatus.Loaded
      ) {
        const { bandwidth } = peer;
        if (bandwidth === undefined) {
          untestedPeers.push(peer);
        } else if (bandwidth > fastedPeerBandwidth) {
          fastedPeerBandwidth = bandwidth;
          fastestPeer = peer;
        }
      }
    }

    const peer = untestedPeers.length
      ? getRandomItem(untestedPeers)
      : fastestPeer;

    if (!peer) return;

    const request = peer.requestSegment(segment);
    this.requests.addLoaderRequest(segment, request);
    this.logger(
      `p2p request ${segment.externalId} | ${LoggerUtils.getStatusesString(
        statuses
      )}`
    );
    request.promise.then(() => {
      this.logger(`p2p loaded: ${segment.externalId}`);
    });

    return request.promise;
  }

  isLoadingOrLoadedBySomeone(segment: Segment): boolean {
    for (const peer of this.peers.values()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  get connectedPeersAmount() {
    let count = 0;
    for (const peer of this.peers.values()) {
      if (peer.isConnected) count++;
    }
    return count;
  }

  private updateSegmentAnnouncement() {
    const loaded: string[] =
      this.segmentStorage.getStoredSegmentExternalIdsOfStream(this.stream);
    const httpLoading: string[] = [];

    for (const request of this.requests.httpRequests()) {
      const segment = this.stream.segments.get(request.segment.localId);
      if (!segment) continue;

      httpLoading.push(segment.externalId);
    }

    this.announcement = PeerUtil.getJsonSegmentsAnnouncement(
      loaded,
      httpLoading
    );
  }

  private onPeerConnected(peer: Peer) {
    this.logger(`connected with peer: ${peer.id}`);
    peer.sendSegmentsAnnouncement(this.announcement);
  }

  private onPeerClosed(peer: Peer) {
    this.logger(`peer closed: ${peer.id}`);
    this.peers.delete(peer.id);
  }

  private updateAndBroadcastAnnouncement = () => {
    if (this.broadcastAnnouncementTaskId) return;

    // for only execution for macrotask
    this.broadcastAnnouncementTaskId = window.setTimeout(() => {
      this.updateSegmentAnnouncement();
      this.broadcastSegmentAnnouncement();
      this.broadcastAnnouncementTaskId = undefined;
    }, 0);
  };

  private async onSegmentRequested(peer: Peer, segmentExternalId: string) {
    const segment = Utils.getSegmentFromStreamByExternalId(
      this.stream,
      segmentExternalId
    );
    const segmentData =
      segment && (await this.segmentStorage.getSegmentData(segment));
    if (segmentData) void peer.sendSegmentData(segmentExternalId, segmentData);
    else peer.sendSegmentAbsent(segmentExternalId);
  }

  private broadcastSegmentAnnouncement() {
    console.log("BROADCAST ANNOUNCEMENT");
    for (const peer of this.peers.values()) {
      if (!peer.isConnected) continue;
      peer.sendSegmentsAnnouncement(this.announcement);
    }
  }

  destroy() {
    this.logger(
      `destroy tracker client: ${LoggerUtils.getStreamString(this.stream)}`
    );
    this.segmentStorage.unsubscribeFromUpdate(
      this.stream,
      this.updateAndBroadcastAnnouncement
    );
    this.requests.unsubscribeFromHttpRequestsUpdate(
      this.updateAndBroadcastAnnouncement
    );
    for (const peer of this.peers.values()) {
      peer.destroy();
    }
    this.peers.clear();
    this.trackerClient.destroy();
    clearTimeout(this.broadcastAnnouncementTaskId);
  }
}

function createTrackerClient({
  streamHash,
  peerHash,
}: {
  streamHash: string;
  peerHash: string;
}) {
  return new TrackerClient({
    infoHash: streamHash,
    peerId: peerHash,
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
}

function utf8ToHex(utf8String: string) {
  let result = "";
  for (let i = 0; i < utf8String.length; i++) {
    result += utf8String.charCodeAt(i).toString(16);
  }

  return result;
}

function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
