import TrackerClient, { PeerConnection } from "bittorrent-tracker";
import { Peer } from "./peer";
import * as PeerUtil from "../utils/peer";
import { Segment, Settings, StreamWithSegments } from "../types";
import { QueueItem } from "../internal-types";
import { SegmentsMemoryStorage } from "../segments-storage";
import * as Utils from "../utils/utils";
import * as LoggerUtils from "../utils/logger";
import { RequestsContainer } from "../request-container";
import debug from "debug";

export class P2PLoader {
  private readonly streamHash: string;
  private readonly peerId: string;
  private readonly trackerClient: TrackerClient;
  private readonly peers = new Map<string, Peer>();
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
    const streamExternalId = Utils.getStreamExternalId(
      this.streamManifestUrl,
      this.stream
    );
    this.streamHash = PeerUtil.getStreamHash(streamExternalId);

    this.trackerClient = createTrackerClient({
      streamHash: utf8ToHex(this.streamHash),
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
      this.broadcastAnnouncement
    );
    this.requests.subscribeOnHttpRequestsUpdate(this.broadcastAnnouncement);
    this.trackerClient.start();
  }

  private subscribeOnTrackerEvents(trackerClient: TrackerClient) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    trackerClient.on("update", () => {});
    trackerClient.on("peer", (peerConnection) => {
      const peer = this.peers.get(peerConnection.id);
      if (peer) peer.addConnection(peerConnection);
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

  downloadSegment(item: QueueItem): Promise<ArrayBuffer> | undefined {
    const { segment, statuses } = item;
    const untestedPeers: Peer[] = [];
    let fastestPeer: Peer | undefined;
    let fastestPeerBandwidth = 0;

    for (const peer of this.peers.values()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === "loaded"
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

  private getSegmentsAnnouncement() {
    const loaded: number[] =
      this.segmentStorage.getStoredSegmentExternalIdsOfStream(this.stream);
    const httpLoading: number[] = [];

    for (const request of this.requests.httpRequests()) {
      const segment = this.stream.segments.get(request.segment.localId);
      if (!segment) continue;

      httpLoading.push(segment.externalId);
    }
    return { loaded, httpLoading };
  }

  private onPeerConnected(peer: Peer) {
    this.logger(`connected with peer: ${peer.id}`);
    const announcement = this.getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncement(announcement);
  }

  private onPeerClosed(peer: Peer) {
    this.logger(`peer closed: ${peer.id}`);
    this.peers.delete(peer.id);
  }

  private broadcastAnnouncement = () => {
    if (this.isAnnounceMicrotaskCreated) return;

    this.isAnnounceMicrotaskCreated = true;
    queueMicrotask(() => {
      const announcement = this.getSegmentsAnnouncement();
      for (const peer of this.peers.values()) {
        if (!peer.isConnected) continue;
        peer.sendSegmentsAnnouncement(announcement);
      }
      this.isAnnounceMicrotaskCreated = false;
    });
  };

  private async onSegmentRequested(peer: Peer, segmentExternalId: number) {
    const segment = Utils.getSegmentFromStreamByExternalId(
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
    this.requests.unsubscribeFromHttpRequestsUpdate(this.broadcastAnnouncement);
    for (const peer of this.peers.values()) {
      peer.destroy();
    }
    this.peers.clear();
    this.trackerClient.destroy();
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
