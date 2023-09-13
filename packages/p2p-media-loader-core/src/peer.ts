import { PeerCandidate } from "bittorrent-tracker";
import { PeerCommand } from "./internal-types";
import { PeerSegmentStatus, PeerCommandType } from "./enums";
import * as PeerUtil from "./peer-utils";

export class Peer {
  readonly id: string;
  private readonly candidates = new Set<PeerCandidate>();
  private connection?: PeerCandidate;
  private segments = new Map<string, PeerSegmentStatus>();

  constructor(candidate: PeerCandidate) {
    this.id = candidate.id;
    this.addCandidate(candidate);
  }

  addCandidate(candidate: PeerCandidate) {
    candidate.on("connect", () => this.onCandidateConnect(candidate));
    candidate.on("close", () => this.onCandidateClose(candidate));
    candidate.on("data", () => this.onReceiveData.bind(this));
    this.candidates.add(candidate);
  }

  private onCandidateConnect(candidate: PeerCandidate) {
    if (this.connection) {
      candidate.destroy();
      return;
    }
    this.connection = candidate;

    for (const candidate of this.candidates) {
      if (candidate !== this.connection) {
        candidate.destroy();
        this.candidates.delete(candidate);
      }
    }
  }

  private onCandidateClose(candidate: PeerCandidate) {
    if (this.connection !== candidate) {
      this.candidates.delete(candidate);
      return;
    }
  }

  private onReceiveData(data: ArrayBuffer) {
    const command = PeerUtil.getPeerCommandFromArrayBuffer(data);
    if (!command) return;

    this.handleCommand(command);
  }

  private handleCommand(command: PeerCommand) {
    switch (command.c) {
      case PeerCommandType.SegmentMap:
        this.segments = PeerUtil.getSegmentsFromPeerSegmentMapCommand(
          command.m
        );
        break;

      case PeerCommandType.SegmentRequest:
        break;
    }
  }

  private sendCommand(command: PeerCommand) {
    if (!this.connection) return;
    this.connection.send(JSON.stringify(command));
  }
}
