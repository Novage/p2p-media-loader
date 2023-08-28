import { Loader } from "./loader";
import { Stream, StreamWithSegments, Segment, SegmentResponse } from "./types";
import * as Utils from "./utils";
import { LinkedMap } from "./linked-map";
import { LoadQueue } from "./load-queue";
import { Playback } from "./playback";
import { SegmentsMemoryStorage } from "./segments-storage";

export class Core<TStream extends Stream = Stream> {
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private readonly playback: Playback = new Playback({
    highDemandBufferLength: 15,
    lowDemandBufferLength: 60,
  });
  private readonly segmentStorage = new SegmentsMemoryStorage(this.playback, {
    cachedSegmentExpiration: 120,
    cachedSegmentsCount: 50,
  });
  private readonly mainQueue = new LoadQueue(
    this.streams,
    this.playback,
    this.segmentStorage
  );
  private readonly secondaryQueue: LoadQueue = new LoadQueue(
    this.streams,
    this.playback,
    this.segmentStorage
  );
  private readonly loader: Loader = new Loader(
    this.streams,
    this.mainQueue,
    this.secondaryQueue,
    this.segmentStorage
  );

  setManifestResponseUrl(url: string): void {
    this.loader.setManifestResponseUrl(url.split("?")[0]);
  }

  hasSegment(segmentLocalId: string): boolean {
    const { segment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentLocalId) ?? {};
    return !!segment;
  }

  getStream(streamLocalId: string): StreamWithSegments<TStream> | undefined {
    return this.streams.get(streamLocalId);
  }

  addStreamIfNoneExists(stream: TStream): void {
    if (this.streams.has(stream.localId)) return;
    this.streams.set(stream.localId, {
      ...stream,
      segments: new LinkedMap<string, Segment>(),
    });
  }

  updateStream(
    streamLocalId: string,
    addSegments?: Segment[],
    removeSegmentIds?: string[]
  ): void {
    const stream = this.streams.get(streamLocalId);
    if (!stream) return;

    addSegments?.forEach((s) => stream.segments.addToEnd(s.localId, s));
    removeSegmentIds?.forEach((id) => stream.segments.delete(id));
  }

  loadSegment(segmentLocalId: string): Promise<SegmentResponse> {
    return this.loader.loadSegment(segmentLocalId);
  }

  abortSegmentLoading(segmentId: string): void {
    return this.loader.abortSegment(segmentId);
  }

  updatePlayback(position: number, rate: number): void {
    this.playback.position = position;
    this.playback.rate = rate;
    this.mainQueue.removeNotInLoadTimeRange();
    this.secondaryQueue.removeNotInLoadTimeRange();
  }

  destroy(): void {
    this.streams.clear();
  }
}
