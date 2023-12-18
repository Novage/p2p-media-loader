import { LinkedMap } from "./linked-map";
import { RequestAttempt } from "./request";

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

export type ReadonlyLinkedMap<K, V extends object> = Pick<
  LinkedMap<K, V>,
  "has" | "keys" | "values" | "size"
>;

export type StreamWithSegments<
  TStream extends Stream = Stream,
  TMap extends ReadonlyLinkedMap<string, SegmentBase> = LinkedMap<
    string,
    Segment
  >
> = TStream & {
  readonly segments: TMap;
};

export type StreamWithReadonlySegments<TStream extends Stream = Stream> =
  StreamWithSegments<TStream, ReadonlyLinkedMap<string, SegmentBase>>;

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
};

export type CoreEventHandlers = {
  onSegmentLoaded?: (byteLength: number, type: RequestAttempt["type"]) => void;
};

export type Playback = {
  position: number;
  rate: number;
};
