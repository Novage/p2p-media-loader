import { BandwidthCalculator } from "./bandwidth-calculator";

export type StreamType = "main" | "secondary";

export type ByteRange = { start: number; end: number };

export type SegmentBase = {
  readonly localId: string;
  readonly externalId: number;
  readonly url: string;
  readonly byteRange?: ByteRange;
  readonly startTime: number;
  readonly endTime: number;
};

export type Segment = SegmentBase & {
  readonly stream: StreamWithSegments;
};

export type Stream = {
  readonly localId: string;
  readonly type: StreamType;
  readonly index: number;
};

export type StreamWithSegments<
  TStream extends Stream = Stream,
  TMap extends ReadonlyMap<string, SegmentBase> = Map<string, Segment>,
> = TStream & {
  readonly segments: TMap;
};

export type StreamWithReadonlySegments<TStream extends Stream = Stream> =
  StreamWithSegments<TStream, ReadonlyMap<string, SegmentBase>>;

export type SegmentResponse = {
  data: ArrayBuffer;
  bandwidth: number;
};

export type Settings = {
  highDemandTimeWindow: number;
  httpDownloadTimeWindow: number;
  p2pDownloadTimeWindow: number;
  simultaneousHttpDownloads: number;
  simultaneousP2PDownloads: number;
  cachedSegmentExpiration: number;
  cachedSegmentsCount: number;
  webRtcMaxMessageSize: number;
  p2pNotReceivingBytesTimeoutMs: number;
  p2pLoaderDestroyTimeoutMs: number;
  httpNotReceivingBytesTimeoutMs: number;
  httpErrorRetries: number;
  p2pErrorRetries: number;
  validateP2PSegment?: (url: string, byteRange?: ByteRange) => Promise<boolean>;
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;
};

export interface SegmentEventDetails {
  segment: Segment;
  downloadSource: "p2p" | "http";
  peerId: string | undefined;
}

export interface SegmentErrorDetails extends SegmentEventDetails {
  error: RequestError;
}

export interface SegmentAbortDetails
  extends Pick<SegmentEventDetails, "segment" | "peerId"> {
  downloadSource: "p2p" | "http" | undefined;
}

export interface SegmentLoadDetails {
  bytesLength: number;
  downloadSource: "p2p" | "http";
}

export type CoreEventMap = {
  onSegmentLoaded: (params: SegmentLoadDetails) => void;
  onSegmentError: (params: SegmentErrorDetails) => void;
  onSegmentAbort: (params: SegmentAbortDetails) => void;
  onSegmentStart: (params: SegmentEventDetails) => void;
  onPeerConnect: (peerId: string) => void;
  onPeerClose: (peerId: string) => void;
  onChunkDownloaded: (
    bytesLength: number,
    type: "http" | "p2p",
    peerId?: string,
  ) => void;
  onChunkUploaded: (bytesLength: number, peerId: string) => void;
};

export type Playback = {
  position: number;
  rate: number;
};

export type BandwidthCalculators = Readonly<{
  all: BandwidthCalculator;
  http: BandwidthCalculator;
}>;

export type StreamDetails = {
  isLive: boolean;
  activeLevelBitrate: number;
};

export type RequestInnerErrorType = "abort" | "bytes-receiving-timeout";

export type HttpRequestErrorType =
  | "http-error"
  | "http-bytes-mismatch"
  | "http-unexpected-status-code";

export type PeerRequestErrorType =
  | "peer-response-bytes-length-mismatch"
  | "peer-protocol-violation"
  | "peer-segment-absent"
  | "peer-closed"
  | "p2p-segment-validation-failed";

export type RequestErrorType =
  | RequestInnerErrorType
  | PeerRequestErrorType
  | HttpRequestErrorType;

export class RequestError<
  T extends RequestErrorType = RequestErrorType,
> extends Error {
  readonly timestamp: number;

  constructor(
    readonly type: T,
    message?: string,
  ) {
    super(message);
    this.timestamp = performance.now();
  }
}
