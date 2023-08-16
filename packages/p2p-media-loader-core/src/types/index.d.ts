export type StreamType = "video" | "audio";

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
  readonly segments: Map<string, Segment>;
  readonly url?: string;
};

type ReadonlyMap<T extends Map<unknown, unknown>> = Omit<
  T,
  "set" | "delete" | "clear"
>;

export type ReadonlyStream<TStream extends Stream> = Omit<
  TStream,
  "segments"
> & {
  segments: ReadonlyMap<Stream["segments"]>;
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
