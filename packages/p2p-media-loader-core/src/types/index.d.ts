export type StreamType = "main" | "secondary";

export type ByteRange = { start: number; end: number };

export type Segment = {
  readonly localId: string;
  readonly externalId: number;
  readonly url: string;
  readonly byteRange?: ByteRange;
  readonly startTime: number;
  readonly endTime: number;
};

export type Stream = {
  readonly localId: string;
  readonly type: StreamType;
  readonly index: number;
  readonly url?: string;
};

type StreamWithSegments<TStream extends Stream = Stream> = TStream & {
  readonly segments: Map<string, Segment>;
};

export type ReadonlyStreamWithSegments<TStream extends Stream> = TStream & {
  readonly segments: ReadonlyMap<string, Segment>;
};

export type SegmentResponse = {
  data: ArrayBuffer;
  url: string;
  bandwidth: number;
  status: number;
  ok: boolean;
};

export type Playback = {
  position: number;
  rate: number;
};
