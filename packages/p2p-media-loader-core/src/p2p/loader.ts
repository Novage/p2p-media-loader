import { Peer } from "./peer";
import { Segment, Settings, StreamWithSegments } from "../types";
import { SegmentsMemoryStorage } from "../segments-storage";
import { RequestsContainer } from "../requests/request-container";
import { Request } from "../requests/request";
import { P2PTrackerClient } from "./tracker-client";
import * as StreamUtils from "../utils/stream";
import * as Utils from "../utils/utils";

export class P2PLoader {
  private readonly trackerClient: P2PTrackerClient;
  private isAnnounceMicrotaskCreated = false;

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentsMemoryStorage,
    private readonly settings: Settings,
  ) {
    const streamExternalId = StreamUtils.getStreamExternalId(
      this.streamManifestUrl,
      this.stream,
    );

    this.trackerClient = new P2PTrackerClient(
      streamExternalId,
      this.stream,
      {
        onPeerConnected: this.onPeerConnected,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSegmentRequested: this.onSegmentRequested,
      },
      this.settings,
    );

    this.segmentStorage.subscribeOnUpdate(
      this.stream,
      this.broadcastAnnouncement,
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
    peer.downloadSegment(request);
  }

  isSegmentLoadingOrLoadedBySomeone(segment: Segment): boolean {
    for (const peer of this.trackerClient.peers()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  isSegmentLoadedBySomeone(segment: Segment): boolean {
    for (const peer of this.trackerClient.peers()) {
      if (peer.getSegmentStatus(segment) === "loaded") return true;
    }
    return false;
  }

  get connectedPeerCount() {
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
    const { httpLoading, loaded } = this.getSegmentsAnnouncement();
    peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
  };

  broadcastAnnouncement = () => {
    if (this.isAnnounceMicrotaskCreated) return;

    this.isAnnounceMicrotaskCreated = true;
    queueMicrotask(() => {
      const { httpLoading, loaded } = this.getSegmentsAnnouncement();
      for (const peer of this.trackerClient.peers()) {
        peer.sendSegmentsAnnouncementCommand(loaded, httpLoading);
      }
      this.isAnnounceMicrotaskCreated = false;
    });
  };

  private onSegmentRequested = async (
    peer: Peer,
    segmentExternalId: number,
    byteFrom?: number,
  ) => {
    const segment = StreamUtils.getSegmentFromStreamByExternalId(
      this.stream,
      segmentExternalId,
    );
    if (!segment) return;
    const segmentData = await this.segmentStorage.getSegmentData(segment);
    if (!segmentData) {
      peer.sendSegmentAbsentCommand(segmentExternalId);
      return;
    }
    void peer.uploadSegmentData(
      segment,
      byteFrom !== undefined ? segmentData.slice(byteFrom) : segmentData,
    );
  };

  destroy() {
    this.segmentStorage.unsubscribeFromUpdate(
      this.stream,
      this.broadcastAnnouncement,
    );
    this.trackerClient.destroy();
  }
}
