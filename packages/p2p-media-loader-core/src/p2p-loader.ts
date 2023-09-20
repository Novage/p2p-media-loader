import TrackerClient, { PeerCandidate } from "bittorrent-tracker";
import * as RIPEMD160 from "ripemd160";
import { Peer } from "./peer";
import * as PeerUtil from "./peer-utils";
import { Segment, StreamWithSegments } from "./types";
import { JsonSegmentAnnouncementMap } from "./internal-types";
import { SegmentsMemoryStorage } from "./segments-storage";
import * as Utils from "./utils";
import { PeerSegmentStatus } from "./enums";
import { RequestContainer } from "./request";

export class P2PLoader {
  private readonly streamExternalId: string;
  private readonly streamHash: string;
  private readonly peerHash: string;
  private readonly trackerClient: TrackerClient;
  private readonly peers = new Map<string, Peer>();
  private announcementMap: JsonSegmentAnnouncementMap = {};

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestContainer,
    private readonly segmentStorage: SegmentsMemoryStorage
  ) {
    const peerId = PeerUtil.generatePeerId();
    this.streamExternalId = Utils.getStreamExternalId(
      this.stream,
      this.streamManifestUrl
    );
    this.streamHash = getHash(this.streamExternalId);
    this.peerHash = getHash(peerId);

    this.trackerClient = createTrackerClient({
      streamHash: this.streamHash,
      peerHash: this.peerHash,
    });
    this.subscribeOnTrackerEvents(this.trackerClient);
    this.segmentStorage.subscribeOnUpdate(
      this.onSegmentStorageUpdate.bind(this)
    );
    this.trackerClient.start();
  }

  private subscribeOnTrackerEvents(trackerClient: TrackerClient) {
    // TODO: tracker event handlers
    trackerClient.on("update", () => {});
    trackerClient.on("peer", (candidate) => {
      const peer = this.peers.get(candidate.id);
      if (peer) peer.addCandidate(candidate);
      else this.createPeer(candidate);
    });
    trackerClient.on("warning", (warning) => {});
    trackerClient.on("error", (error) => {});
  }

  async downloadSegment(segment: Segment): Promise<ArrayBuffer | undefined> {
    const segmentExternalId = segment.externalId.toString();
    const peerWithSegment: Peer[] = [];

    for (const peer of this.peers.values()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segmentExternalId) === PeerSegmentStatus.Loaded
      ) {
        peerWithSegment.push(peer);
      }
    }

    if (peerWithSegment.length === 0) return undefined;

    const peer =
      peerWithSegment[Math.floor(Math.random() * peerWithSegment.length)];
    const request = peer.requestSegment(segment);
    this.requests.addLoaderRequest(segment, request);
    return request.promise;
  }

  private createPeer(candidate: PeerCandidate) {
    const peer = new Peer(candidate, {
      onPeerConnected: this.onPeerConnected.bind(this),
      onSegmentRequested: this.onSegmentRequested.bind(this),
    });
    this.peers.set(candidate.id, peer);
  }

  private async onSegmentStorageUpdate() {
    const { storedSegmentIds } = this.segmentStorage;
    const loaded: Segment[] = [];
    const httpLoading: Segment[] = [];

    for (const id of storedSegmentIds) {
      const segment = this.stream.segments.get(id);
      if (!segment) continue;

      loaded.push(segment);
    }

    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type !== "http") continue;
      const segment = this.stream.segments.get(request.segment.localId);
      if (!segment) continue;

      httpLoading.push(segment);
    }

    this.announcementMap = PeerUtil.getJsonSegmentsAnnouncementMap(
      this.streamExternalId,
      loaded,
      httpLoading
    );
    this.broadcastSegmentAnnouncement();
  }

  private onPeerConnected(peer: Peer) {
    peer.sendSegmentsAnnouncement(this.announcementMap);
  }

  private async onSegmentRequested(peer: Peer, segmentExternalId: string) {
    const segmentData = await this.segmentStorage.getSegmentData(
      segmentExternalId
    );
    if (segmentData) peer.sendSegmentData(segmentExternalId, segmentData);
    else peer.sendSegmentAbsent(segmentExternalId);
  }

  private broadcastSegmentAnnouncement() {
    for (const peer of this.peers.values()) {
      if (!peer.isConnected) continue;
      peer.sendSegmentsAnnouncement(this.announcementMap);
    }
  }
}

function getHash(data: string) {
  return new RIPEMD160().update(data).digest("hex");
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
}
