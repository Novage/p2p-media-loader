import { Segment, Stream, StreamWithSegments } from "../index";

export function getStreamExternalId(
  manifestResponseUrl: string,
  stream: Readonly<Stream>
): string {
  const { type, index } = stream;
  return `${manifestResponseUrl}-${type}-${index}`;
}

export function getSegmentFullExternalId(
  externalStreamId: string,
  externalSegmentId: string
) {
  return `${externalStreamId}|${externalSegmentId}`;
}

export function getSegmentFromStreamsMap(
  streams: Map<string, StreamWithSegments>,
  segmentId: string
): { segment: Segment; stream: StreamWithSegments } | undefined {
  for (const stream of streams.values()) {
    const segment = stream.segments.get(segmentId);
    if (segment) return { segment, stream };
  }
}

export function getControlledPromise<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    resolve: resolve!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    reject: reject!,
  };
}
