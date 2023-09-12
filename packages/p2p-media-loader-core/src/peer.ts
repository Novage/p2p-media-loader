import { PeerCandidate } from "bittorrent-tracker";
import { PeerCommandType, PeerCommand } from "./internal-types";
import * as PeerUtil from "./peer-utils";

export class Peer {
  readonly id: string;
  private readonly candidates = new Set<PeerCandidate>();
  private connectedCandidate?: PeerCandidate;
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
    if (this.connectedCandidate) {
      candidate.destroy();
      return;
    }
    this.connectedCandidate = candidate;

    for (const candidate of this.candidates) {
      if (candidate !== this.connectedCandidate) {
        candidate.destroy();
        this.candidates.delete(candidate);
      }
    }
  }

  private onCandidateClose(candidate: PeerCandidate) {
    if (this.connectedCandidate !== candidate) {
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
}

export enum PeerSegmentStatus {
  Loaded,
  LoadingByHttp,
}
