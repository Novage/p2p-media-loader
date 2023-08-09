export type StreamType = "video" | "audio";

type ByteRange = { start: number; end: number };

export interface Segment {
  readonly localId: string;
  readonly index: number;
  readonly url: string;
  readonly byteRange?: ByteRange;
}

export interface Stream<S extends Segment = Segment> {
  readonly localId: string;
  readonly globalId: string;
  readonly type: StreamType;
  readonly segments: Map<string, S>;
  readonly url?: string;
}

type ReadonlyMap<T extends Map<unknown, unknown>> = Omit<
  T,
  "set" | "delete" | "clear"
>;

export type ReadonlyStream<
  Sgm extends Segment = Segment,
  Str extends Stream<Sgm> = Stream<Sgm>
> = Omit<Str, "segments"> & {
  segments: ReadonlyMap<Stream["segments"]>;
};
