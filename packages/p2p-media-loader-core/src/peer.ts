import { PeerCandidate } from "bittorrent-tracker";
import {
  JsonSegmentAnnouncementMap,
  PeerCommand,
  PeerSegmentRequestCommand,
  PeerSegmentAnnouncementCommand,
} from "./internal-types";
import { PeerCommandType, PeerSegmentStatus } from "./enums";
import * as PeerUtil from "./peer-utils";

export class Peer {
  readonly id: string;
  private readonly streamExternalId: string;
  private readonly candidates = new Set<PeerCandidate>();
  private connection?: PeerCandidate;
  private segments = new Map<string, PeerSegmentStatus>();

  constructor(streamExternalId: string, candidate: PeerCandidate) {
    this.streamExternalId = streamExternalId;
    this.id = candidate.id;
    this.addCandidate(candidate);
  }

  get isConnected() {
    return !!this.connection;
  }

  addCandidate(candidate: PeerCandidate) {
    candidate.on("connect", () => this.onCandidateConnect(candidate));
    candidate.on("close", () => this.onCandidateClose(candidate));
    candidate.on("data", () => this.onReceiveData.bind(this));
    this.candidates.add(candidate);
  }

  private onCandidateConnect(candidate: PeerCandidate) {
    this.connection = candidate;
  }

  private onCandidateClose(candidate: PeerCandidate) {
    if (this.connection === candidate) {
      this.connection = undefined;
    }
  }

  private onReceiveData(data: ArrayBuffer) {
    const command = PeerUtil.getPeerCommandFromArrayBuffer(data);
    if (!command) return;

    this.handleCommand(command);
  }

  private handleCommand(command: PeerCommand) {
    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.segments = PeerUtil.getSegmentsFromPeerAnnouncementMap(command.m);
        break;

      case PeerCommandType.SegmentRequest:
        break;
    }
  }

  private sendCommand(command: PeerCommand) {
    if (!this.connection) return;
    this.connection.send(JSON.stringify(command));
  }

  requestSegment(segmentExternalId: string) {
    const command: PeerSegmentRequestCommand = {
      c: PeerCommandType.SegmentRequest,
      i: segmentExternalId,
    };
    this.sendCommand(command);
  }

  sendSegmentsAnnouncement(map: JsonSegmentAnnouncementMap) {
    const command: PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      m: map,
    };
    this.sendCommand(command);
  }
}
