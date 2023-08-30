import { Loader } from "./loader";
import { Stream, StreamWithSegments, Segment, SegmentResponse } from "./types";
import * as Utils from "./utils";
import { LinkedMap } from "./linked-map";
import { Playback } from "./playback";
import { SegmentsMemoryStorage } from "./segments-storage";

export class Core<TStream extends Stream = Stream> {
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private readonly playback = new Playback({
    highDemandBufferLength: 15,
    httpDownloadBufferLength: 60,
    p2pDownloadBufferLength: 80,
  });
  private readonly segmentStorage = new SegmentsMemoryStorage(this.playback, {
    cachedSegmentExpiration: 120,
    cachedSegmentsCount: 50,
  });
  private readonly loader = new Loader(
    this.streams,
    this.segmentStorage,
    this.playback,
    { simultaneousHttpDownloads: 3 }
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

    const firstSegment = stream.segments.first?.[1];
    if (firstSegment && firstSegment.startTime > this.playback.position) {
      this.playback.position = firstSegment.startTime;
    }
  }

  loadSegment(segmentLocalId: string): Promise<SegmentResponse> {
    return this.loader.requestSegmentByPlugin(segmentLocalId);
  }

  abortSegmentLoading(segmentId: string): void {
    return this.loader.abortSegment(segmentId);
  }

  updatePlayback(position: number, rate: number): void {
    this.playback.position = position;
    this.playback.rate = rate;
  }

  destroy(): void {
    this.streams.clear();
  }
}
