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
import { P2PRequest } from "./request";
import { Segment, Settings } from "./types";
import * as Utils from "./utils";
import {
  RequestAbortError,
  RequestTimeoutError,
  ResponseBytesMismatchError,
  PeerSegmentAbsentError,
} from "./errors";

type PeerEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentId: string) => void;
};

type PeerRequest = {
  segment: Segment;
  p2pRequest: P2PRequest;
  resolve: (data: ArrayBuffer) => void;
  reject: (reason?: unknown) => void;
  chunks: ArrayBuffer[];
  responseTimeoutId: number;
};

type PeerSettings = Pick<
  Settings,
  "p2pSegmentDownloadTimeout" | "webRtcMaxMessageSize"
>;

export class Peer {
  readonly id: string;
  private readonly candidates = new Set<PeerCandidate>();
  private connection?: PeerCandidate;
  private segments = new Map<string, PeerSegmentStatus>();
  private request?: PeerRequest;
  private isSendingData = false;

  constructor(
    candidate: PeerCandidate,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = candidate.id;
    this.eventHandlers = eventHandlers;
    this.addCandidate(candidate);
  }

  addCandidate(candidate: PeerCandidate) {
    candidate.on("connect", () => {
      this.connection = candidate;
      this.eventHandlers.onPeerConnected(this);
    });
    candidate.on("close", () => {
      if (this.connection === candidate) this.connection = undefined;
    });
    candidate.on("data", () => this.onReceiveData.bind(this));
    this.candidates.add(candidate);
  }

  get isConnected() {
    return !!this.connection;
  }

  get downloadingSegment(): Segment | undefined {
    return this.request?.segment;
  }

  getSegmentStatus(segmentExternalId: string): PeerSegmentStatus | undefined {
    return this.segments.get(segmentExternalId);
  }

  private onReceiveData(data: ArrayBuffer) {
    const command = PeerUtil.getPeerCommandFromArrayBuffer(data);
    if (!command) {
      this.receiveSegmentChuck(data);
      return;
    }

    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.segments = PeerUtil.getSegmentsFromPeerAnnouncementMap(command.m);
        break;

      case PeerCommandType.SegmentRequest:
        this.eventHandlers.onSegmentRequested(this, command.i);
        break;

      case PeerCommandType.SegmentData:
        if (this.request?.segment.externalId.toString() === command.i) {
          this.request.p2pRequest.progress = {
            percent: 0,
            loadedBytes: 0,
            totalBytes: command.s,
          };
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.request?.segment.externalId.toString() === command.i) {
          this.cancelSegmentRequest(new PeerSegmentAbsentError());
          this.segments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.stopSendSegmentData();
        break;
    }
  }

  private sendCommand(command: PeerCommand) {
    if (!this.connection) return;
    this.connection.send(JSON.stringify(command));
  }

  requestSegment(segment: Segment) {
    if (this.request) {
      throw new Error("Segment already is downloading");
    }
    const { externalId } = segment;
    const command: PeerSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: externalId.toString(),
    };
    this.sendCommand(command);
    this.request = this.createPeerRequest(segment);
    return this.request.p2pRequest;
  }

  private createPeerRequest(segment: Segment): PeerRequest {
    const { promise, resolve, reject } =
      Utils.getControlledPromise<ArrayBuffer>();
    return {
      segment,
      resolve,
      reject,
      responseTimeoutId: this.setRequestTimeout(),
      chunks: [],
      p2pRequest: {
        type: "p2p",
        startTimestamp: performance.now(),
        promise,
        abort: () => this.cancelSegmentRequest(new RequestAbortError()),
      },
    };
  }

  private setRequestTimeout(): number {
    return window.setTimeout(
      () => this.cancelSegmentRequest(new RequestTimeoutError()),
      this.settings.p2pSegmentDownloadTimeout
    );
  }

  private cancelSegmentRequest(
    reason:
      | RequestAbortError
      | RequestTimeoutError
      | PeerSegmentAbsentError
      | ResponseBytesMismatchError
  ) {
    if (!this.request) return;
    if (!(reason instanceof PeerSegmentAbsentError)) {
      this.sendCommand({
        c: PeerCommandType.CancelSegmentRequest,
        i: this.request.segment.externalId.toString(),
      });
    }
    this.request.reject(reason);
    this.clearRequest();
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

    this.isSendingData = true;
    const sendChuck = async (data: ArrayBuffer) => this.connection?.send(data);
    for (const chuck of getBufferChunks(
      data,
      this.settings.webRtcMaxMessageSize
    )) {
      if (!this.isSendingData) break;
      void sendChuck(chuck);
    }
    this.isSendingData = false;
  }

  stopSendSegmentData() {
    this.isSendingData = false;
  }

  sendSegmentAbsent(segmentExternalId: string) {
    const command: PeerSegmentCommand = {
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    };
    this.sendCommand(command);
  }

  private receiveSegmentChuck(chuck: ArrayBuffer): void {
    // TODO: check can be chunk received before peer command answer
    const { request } = this;
    const progress = request?.p2pRequest?.progress;
    if (!request || !progress) return;

    progress.loadedBytes += chuck.byteLength;
    progress.percent = (progress.loadedBytes / progress.loadedBytes) * 100;
    request.chunks.push(chuck);

    if (progress.loadedBytes === progress.totalBytes) {
      const segmentData = joinChunks(request.chunks);
      this.approveRequest(segmentData);
    } else if (progress.loadedBytes > progress.totalBytes) {
      this.cancelSegmentRequest(new ResponseBytesMismatchError());
    }
  }

  private approveRequest(data: ArrayBuffer) {
    this.request?.resolve(data);
    this.clearRequest();
  }

  private clearRequest() {
    clearTimeout(this.request?.responseTimeoutId);
    this.request = undefined;
  }
}

function* getBufferChunks(
  data: ArrayBuffer,
  maxChuckSize: number
): Generator<ArrayBuffer> {
  let bytesLeft = data.byteLength;
  while (bytesLeft > 0) {
    const bytesToSend = bytesLeft >= maxChuckSize ? maxChuckSize : bytesLeft;
    const buffer = Buffer.from(data, data.byteLength - bytesLeft, bytesToSend);
    bytesLeft -= bytesToSend;
    yield buffer;
  }
}

function joinChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  const bytesSum = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new Uint8Array(bytesSum);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return buffer;
}
