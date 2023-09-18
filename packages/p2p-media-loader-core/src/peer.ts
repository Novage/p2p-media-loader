import { PeerCandidate } from "bittorrent-tracker";
import {
  JsonSegmentAnnouncementMap,
  PeerCommand,
  PeerSegmentAnnouncementCommand,
  PeerSegmentCommand,
  PeerSendSegmentCommand,
} from "./internal-types";
import { PeerCommandType, PeerSegmentStatus } from "./enums";
import * as PeerUtil from "./peer-utils";

const webRtcMaxMessageSize: number = 64 * 1024 - 1;

type PeerEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentId: string) => void;
};

export class Peer {
  readonly id: string;
  private readonly candidates = new Set<PeerCandidate>();
  private connection?: PeerCandidate;
  private readonly eventHandlers: PeerEventHandlers;
  private segments = new Map<string, PeerSegmentStatus>();

  constructor(candidate: PeerCandidate, eventHandlers: PeerEventHandlers) {
    this.id = candidate.id;
    this.eventHandlers = eventHandlers;
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
    this.eventHandlers.onPeerConnected(this);
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
        this.eventHandlers.onSegmentRequested(this, command.i);
        break;
    }
  }

  private sendCommand(command: PeerCommand) {
    if (!this.connection) return;
    this.connection.send(JSON.stringify(command));
  }

  requestSegment(segmentExternalId: string) {
    const command: PeerSegmentCommand = {
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

  sendSegmentData(segmentExternalId: string, data: ArrayBuffer) {
    if (!this.connection) return;
    const command: PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: segmentExternalId,
      s: data.byteLength,
    };

    this.sendCommand(command);

    let bytesLeft = data.byteLength;
    while (bytesLeft > 0) {
      const bytesToSend =
        bytesLeft >= webRtcMaxMessageSize ? webRtcMaxMessageSize : bytesLeft;
      const buffer = Buffer.from(
        data,
        data.byteLength - bytesLeft,
        bytesToSend
      );

      this.connection.send(buffer);
      bytesLeft -= bytesToSend;
    }
  }

  sendSegmentAbsent(segmentExternalId: string) {
    const command: PeerSegmentCommand = {
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    };
    this.sendCommand(command);
  }
}
