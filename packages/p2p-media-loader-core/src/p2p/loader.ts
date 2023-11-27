import { Peer } from "./peer";
import { Segment, Settings, StreamWithSegments } from "../types";
import { QueueItem } from "../internal-types";
import { SegmentsMemoryStorage } from "../segments-storage";
import * as PeerUtil from "../utils/peer";
import * as LoggerUtils from "../utils/logger";
import * as StreamUtils from "../utils/stream";
import * as Utils from "../utils/utils";
import { PeerSegmentStatus } from "../enums";
import { RequestsContainer } from "../request-container";
import { Request } from "../request";
import { P2PTrackerClient } from "./tracker-client";
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
    // request.subscribe("onSuccess", () => {
    //   this.logger(`p2p loaded: ${segment.externalId}`);
    // });

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  private onPeerConnected = (peer: Peer) => {
    this.logger(`connected with peer: ${peer.id}`);
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
    segmentExternalId: string
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
    this.logger(
      `destroy tracker client: ${LoggerUtils.getStreamString(this.stream)}`
    );
    this.segmentStorage.unsubscribeFromUpdate(
      this.stream,
      this.broadcastAnnouncement
    );
    this.trackerClient.destroy();
  }
}
