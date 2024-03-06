import { BandwidthCalculator } from "./bandwidth-calculator";
import { RequestAttempt } from "./requests/request";

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

export type Config = {
  coreSettings: Partial<
    Pick<
      Settings,
      | "webRtcMaxMessageSize"
      | "p2pNotReceivingBytesTimeoutMs"
      | "httpNotReceivingBytesTimeoutMs"
      | "httpErrorRetries"
      | "p2pErrorRetries"
      | "validateP2PSegment"
      | "httpRequestSetup"
      | "rtcConfig"
      | "announceTrackers"
    >
  >;
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
  announceTrackers?: string[];
  rtcConfig?: RTCConfiguration;
  validateP2PSegment?: (url: string, byteRange?: ByteRange) => Promise<boolean>;
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;
};

export type CoreEventMap = {
  onSegmentLoaded: (byteLength: number, type: RequestAttempt["type"]) => void;
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
