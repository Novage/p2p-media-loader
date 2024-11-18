import { Peer } from "./peer.js";
import {
  CoreEventMap,
  SegmentWithStream,
  StreamConfig,
  StreamWithSegments,
} from "../types.js";
import { RequestsContainer } from "../requests/request-container.js";
import { P2PTrackerClient } from "./tracker-client.js";
import * as StreamUtils from "../utils/stream.js";
import * as Utils from "../utils/utils.js";
import { EventTarget } from "../utils/event-target.js";
import { SegmentStorage } from "../segment-storage/index.js";

export type EventTargetMap = Record<`onStorageUpdated-${string}`, () => void> &
  CoreEventMap;

export class P2PLoader {
  private readonly trackerClient: P2PTrackerClient;
  private isAnnounceMicrotaskCreated = false;

  constructor(
    private streamManifestUrl: string,
    private readonly stream: StreamWithSegments,
    private readonly requests: RequestsContainer,
    private readonly segmentStorage: SegmentStorage,
    private readonly config: StreamConfig,
    private readonly eventTarget: EventTarget<EventTargetMap>,
    private readonly onSegmentAnnouncement: () => void,
  ) {
    const swarmId = this.config.swarmId ?? this.streamManifestUrl;
    const streamSwarmId = StreamUtils.getStreamSwarmId(swarmId, this.stream);

    this.trackerClient = new P2PTrackerClient(
      streamSwarmId,
      this.stream,
      {
        onPeerConnected: this.onPeerConnected,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSegmentRequested: this.onSegmentRequested,
        onSegmentsAnnouncement: this.onSegmentAnnouncement,
      },
      this.config,
      this.eventTarget,
    );

    this.eventTarget.addEventListener(
      `onStorageUpdated-${streamSwarmId}`,
      this.broadcastAnnouncement,
    );
    this.segmentStorage.setSegmentChangeCallback((streamId: string) => {
      this.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
    });

    this.trackerClient.start();
  }

  downloadSegment(segment: SegmentWithStream) {
    const peersWithSegment: Peer[] = [];
    for (const peer of this.trackerClient.peers()) {
      if (
        !peer.downloadingSegment &&
        peer.getSegmentStatus(segment) === "loaded"
      ) {
        peersWithSegment.push(peer);
      }
    }

    if (peersWithSegment.length === 0) return;
    const peer = Utils.getRandomItem(peersWithSegment);

    const request = this.requests.getOrCreateRequest(segment);
    peer.downloadSegment(request);
  }

  isSegmentLoadingOrLoadedBySomeone(segment: SegmentWithStream): boolean {
    for (const peer of this.trackerClient.peers()) {
      if (peer.getSegmentStatus(segment)) return true;
    }
    return false;
  }

  isSegmentLoadedBySomeone(segment: SegmentWithStream): boolean {
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
    const swarmId = this.config.swarmId ?? this.streamManifestUrl;
    const streamSwarmId = StreamUtils.getStreamSwarmId(swarmId, this.stream);

    const loaded: number[] = this.segmentStorage.getStoredSegmentIds(
      swarmId,
      streamSwarmId,
    );
    const httpLoading: number[] = [];

    for (const request of this.requests.httpRequests()) {
      const segment = this.stream.segments.get(request.segment.runtimeId);
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
    requestId: number,
    byteFrom?: number,
  ) => {
    const segment = StreamUtils.getSegmentFromStreamByExternalId(
      this.stream,
      segmentExternalId,
    );
    if (!segment) return;

    const swarmId = this.config.swarmId ?? this.streamManifestUrl;
    const streamSwarmId = StreamUtils.getStreamSwarmId(swarmId, this.stream);

    const segmentData = await this.segmentStorage.getSegmentData(
      swarmId,
      streamSwarmId,
      segment.externalId,
    );
    if (!segmentData) {
      peer.sendSegmentAbsentCommand(segmentExternalId, requestId);
      return;
    }
    await peer.uploadSegmentData(
      segment,
      requestId,
      byteFrom !== undefined ? segmentData.slice(byteFrom) : segmentData,
    );
  };

  destroy() {
    const swarmId = this.config.swarmId ?? this.streamManifestUrl;
    const streamSwarmId = StreamUtils.getStreamSwarmId(swarmId, this.stream);

    this.eventTarget.removeEventListener(
      `onStorageUpdated-${streamSwarmId}`,
      this.broadcastAnnouncement,
    );
    this.trackerClient.destroy();
  }
}
