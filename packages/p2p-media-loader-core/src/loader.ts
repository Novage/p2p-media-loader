import { Segment, SegmentResponse, StreamWithSegments } from "./index";
import * as Utils from "./utils";
import { LinkedMap } from "./linked-map";
import { HttpLoader } from "./http-loader";

export class Loader {
  private manifestResponseUrl?: string;
  private readonly streams: Map<string, StreamWithSegments>;
  private readonly mainQueue: LoadQueue;
  private readonly secondaryQueue: LoadQueue;
  private readonly httpLoader = new HttpLoader();

  constructor(streams: Map<string, StreamWithSegments>) {
    this.streams = streams;
    this.mainQueue = new LoadQueue(this.streams);
    this.secondaryQueue = new LoadQueue(this.streams);
  }

  setManifestResponseUrl(url: string) {
    this.manifestResponseUrl = url;
  }

  async loadSegment(segmentId: string): Promise<SegmentResponse> {
    const { segment, stream } = this.identifySegment(segmentId);

    const queue = stream.type === "main" ? this.mainQueue : this.secondaryQueue;
    queue.requestByPlayer(segment.localId);

    const [response, loadingDuration] = await trackTime(
      () => this.httpLoader.load(segment),
      "s"
    );
    queue.removeLoadedSegment(segment.localId);

    const { data, url, ok, status } = response;
    const bits = data.byteLength * 8;

    const bandwidth = bits / loadingDuration;

    return {
      url,
      data,
      bandwidth,
      status,
      ok,
    };
  }

  abortSegment(segmentId: string) {
    this.httpLoader.abort(segmentId);
  }

  private identifySegment(segmentId: string) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

    const { stream, segment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentId) ?? {};
    if (!segment || !stream) {
      throw new Error(`Not found segment with id: ${segmentId}`);
    }

    // console.log("\nloading segment:");
    // console.log("Index: ", segment.externalId);
    const streamEternalId = Utils.getStreamExternalId(
      stream,
      this.manifestResponseUrl
    );
    // console.log("Stream: ", streamEternalId);
    console.log(this.mainQueue);

    return { segment, stream };
  }
}

async function trackTime<T>(
  action: () => T,
  unit: "s" | "ms" = "s"
): Promise<[Awaited<T>, number]> {
  const start = performance.now();
  const result = await action();
  const duration = performance.now() - start;
  return [result, unit === "ms" ? duration : duration / 1000];
}

class LoadQueue {
  private queue = new LinkedMap<string, Segment>();
  private readonly streams: Map<string, StreamWithSegments>;
  private activeStream?: StreamWithSegments;
  private lastReqByPlayer?: Segment;
  private readonly isSegmentLoaded!: (segmentId: string) => boolean;

  constructor(streams: Map<string, StreamWithSegments>) {
    this.streams = streams;
  }

  reqSegment(segmentId: string) {
    const { stream, segment: requestedSegment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentId) ?? {};
  }

  requestByPlayer(segmentId: string) {
    const { stream, segment: requestedSegment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentId) ?? {};
    if (!stream || !requestedSegment) return;

    const prevReqByPlayer = this.lastReqByPlayer;
    this.lastReqByPlayer = requestedSegment;
    if (this.activeStream !== stream) {
      this.activeStream = stream;
      this.streamChanged(this.activeStream, requestedSegment);
      return;
    }
    if (!prevReqByPlayer) return;

    const next = this.activeStream?.segments.getNextTo(prevReqByPlayer.localId);
    if (next === requestedSegment) return;

    if (requestedSegment.startTime > prevReqByPlayer.startTime) {
      this.movedForward(requestedSegment);
    } else if (requestedSegment.startTime < prevReqByPlayer.startTime) {
      this.movedBackward(this.activeStream, requestedSegment);
    }
  }

  private streamChanged(
    activeStream: StreamWithSegments,
    requestedSegment: Segment
  ) {
    this.queue.clear();
    const { localId: segmentId } = requestedSegment;

    for (const segment of activeStream.segments.valuesFrom(segmentId)) {
      if (!this.isSegmentLoaded(segmentId)) {
        this.queue.addToEnd(segment.localId, segment);
      }
    }
  }

  private movedForward(requestedSegment: Segment) {
    const { localId: segmentId } = requestedSegment;
    for (const segment of this.queue.valuesBackwardsFrom(segmentId)) {
      this.queue.delete(segment.localId);
    }
  }

  private movedBackward(
    activeStream: StreamWithSegments,
    requestedSegment: Segment
  ) {
    const { segments } = activeStream;
    const { localId: segmentId } = requestedSegment;
    for (const segment of segments.valuesBackwardsFrom(segmentId)) {
      if (!this.isSegmentLoaded(segment.localId)) {
        this.queue.addToStart(segment.localId, segment);
      }
      if (segment.localId === segmentId) break;
    }
  }

  removeLoadedSegment(segmentId: string) {
    this.queue.delete(segmentId);
  }

  // refreshQueue() {
  //   if (!this.activeStream) return;
  //
  //   for (const loadedSegmentId of this.loadedSegmentIds) {
  //     if (!this.activeStream.segments.has(loadedSegmentId)) {
  //       this.loadedSegmentIds.delete(loadedSegmentId);
  //     }
  //   }
  //
  //   const last = this.queue[this.queue.length - 1];
  //   for (const segment of this.activeStream.segments.values()) {
  //     if (!this.loadedSegmentIds.has(segment.localId)) this.queue.push(segment);
  //   }
  // }
}

class Request {
  segment: Segment;

  constructor(segment: Segment) {
    this.segment = segment;
  }
}
