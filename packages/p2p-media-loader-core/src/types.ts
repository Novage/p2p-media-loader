import { LinkedMap } from "./linked-map";

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
};

export type ReadonlyLinkedMap<K, V extends object> = Pick<
  LinkedMap<K, V>,
  "has"
>;

export type StreamWithSegments<
  TStream extends Stream = Stream,
  TMap extends ReadonlyLinkedMap<string, Segment> = LinkedMap<string, Segment>
> = TStream & {
  readonly segments: TMap;
};

export type SegmentResponse = {
  data: ArrayBuffer;
  url: string;
  bandwidth: number;
  status: number;
  ok: boolean;
};
