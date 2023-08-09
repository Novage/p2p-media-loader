export type StreamType = "video" | "audio";

type ByteRange = { start: number; end: number };

export interface Segment {
  id: string;
  index: number;
  url: string;
  byteRange?: ByteRange;
}

export interface Stream<S extends Segment = Segment> {
  readonly id: string;
  readonly globalId: string;
  readonly type: StreamType;
  readonly segments: Map<string, S>;
}

type ReadonlyMap<T extends Map<unknown, unknown>> = Omit<
  T,
  "set" | "delete" | "clear"
>;

export type ReadonlyStream<S extends Segment = Segment> = Omit<
  Stream<S>,
  "segments"
> & {
  segments: ReadonlyMap<Stream["segments"]>;
};
