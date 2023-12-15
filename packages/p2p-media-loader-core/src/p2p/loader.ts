import { Peer } from "./peer";
import { Segment, Settings, StreamWithSegments } from "../types";
import { SegmentsMemoryStorage } from "../segments-storage";
import * as PeerUtil from "../utils/peer";
import * as StreamUtils from "../utils/stream";
import * as Utils from "../utils/utils";
import * as LoggerUtils from "../utils/logger";
import { RequestsContainer } from "../request-container";
import { Request } from "../request";
import { P2PTrackerClient } from "./tracker-client";

export class P2PLoader {
  private readonly peerId: string;
  private readonly trackerClient: P2PTrackerClient;
  private isAnnounceMicrotaskCreated = false;

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly settings: Settings
  ) {
    const { string: peerIdString, bytes: peerIdBytes } =
      PeerUtil.generatePeerId();
    this.peerId = peerIdString;

    const streamExternalId = StreamUtils.getStreamExternalId(
      this.streamManifestUrl,
      this.stream
    );
    const { bytes: streamIdBytes } = PeerUtil.getStreamHash(streamExternalId);

    this.trackerClient = new P2PTrackerClient(
      peerIdBytes,
      streamIdBytes,
      this.stream,
      {
        onPeerConnected: this.onPeerConnected,
        onSegmentRequested: this.onSegmentRequested,
      },
      this.settings
    );
    this.logger(
      `create tracker client: ${LoggerUtils.getStreamString(stream)}; ${
        this.peerId
      }`
    );

    this.segmentStorage.subscribeOnUpdate(
      this.stream,
      this.broadcastAnnouncement
    );
    this.trackerClient.start();
  }

  downloadSegment(segment: Segment): Request | undefined {
    const peersWithSegment: Peer[] = [];
    for (const peer of this.trackerClient.peers()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === "loaded"
      ) {
        peersWithSegment.push(peer);
      }
    }

    const peer = Utils.getRandomItem(peersWithSegment);
    if (!peer) return;

    const request = this.requests.getOrCreateRequest(segment);
    peer.fulfillSegmentRequest(request);
  }

  isLoadingOrLoadedBySomeone(segment: Segment): boolean {
    for (const peer of this.trackerClient.peers()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  get connectedPeersAmount() {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const peer of this.trackerClient.peers()) count++;
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

  private onPeerConnected = (peer: Peer) => {
    const announcement = this.getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncement(announcement);
  };

  broadcastAnnouncement = () => {
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

  private onSegmentRequested = async (
    peer: Peer,
    segmentExternalId: number
  ) => {
    const segment = StreamUtils.getSegmentFromStreamByExternalId(
      this.stream,
      segmentExternalId
    );
    const segmentData =
      segment && (await this.segmentStorage.getSegmentData(segment));
    if (segmentData) void peer.sendSegmentData(segmentExternalId, segmentData);
    else peer.sendSegmentAbsent(segmentExternalId);
  };

  destroy() {
    this.segmentStorage.unsubscribeFromUpdate(
      this.stream,
      this.broadcastAnnouncement
    );
    this.trackerClient.destroy();
  }
}
