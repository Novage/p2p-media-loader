export type StreamType = "video" | "audio";

type ByteRange = { start: number; end: number };

export type Segment = {
  readonly localId: string;
  readonly index: number;
  readonly url: string;
  readonly byteRange?: ByteRange;
};

export type Stream = {
  readonly localId: string;
  readonly globalId: string;
  readonly type: StreamType;
  readonly segments: Map<string, S>;
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
