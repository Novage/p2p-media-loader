import { Loader } from "./loader";
import { Stream, StreamWithSegments, Segment, SegmentResponse } from "./types";
import { Playback } from "./internal-types";
import * as Utils from "./utils";
import { LinkedMap } from "./linked-map";
import { SegmentsMemoryStorage } from "./segments-storage";

export class Core<TStream extends Stream = Stream> {
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private readonly playback: Playback = { position: 0, rate: 1 };
  private readonly segmentStorage = new SegmentsMemoryStorage(this.playback, {
    cachedSegmentExpiration: 120,
    cachedSegmentsCount: 50,
  });
  private readonly settings = {
    simultaneousHttpDownloads: 3,
    highDemandBufferLength: 20,
    httpBufferLength: 60,
    p2pBufferLength: 60,
  };
  private readonly mainStreamLoader = new Loader(
    this.segmentStorage,
    this.settings
  );
  private readonly secondaryStreamLoader = new Loader(
    this.segmentStorage,
    this.settings
  );

  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = url.split("?")[0];
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
      this.onPlaybackUpdate(this.playback);
    }
  }

  loadSegment(segmentLocalId: string): Promise<SegmentResponse> {
    const { segment, stream } = this.identifySegment(segmentLocalId);

    const loader =
      stream.type === "main"
        ? this.mainStreamLoader
        : this.secondaryStreamLoader;
    return loader.loadSegment(segment, stream);
  }

  abortSegmentLoading(segmentId: string): void {
    this.mainStreamLoader.abortSegment(segmentId);
    this.secondaryStreamLoader.abortSegment(segmentId);
  }

  updatePlayback(position: number, rate: number): void {
    this.playback.position = position;
    this.playback.rate = rate;
    this.onPlaybackUpdate(this.playback);
  }

  destroy(): void {
    this.streams.clear();
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

    return { segment, stream };
  }

  private onPlaybackUpdate(playback: Playback) {
    const { position, rate } = playback;
    this.mainStreamLoader.onPlaybackUpdate(position, rate);
    this.secondaryStreamLoader.onPlaybackUpdate(position, rate);
  }
}
