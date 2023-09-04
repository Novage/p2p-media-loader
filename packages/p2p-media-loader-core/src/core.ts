import { HybridLoader } from "./loader";
import {
  Stream,
  StreamWithSegments,
  Segment,
  SegmentResponse,
  Settings,
} from "./types";
import * as Utils from "./utils";
import { LinkedMap } from "./linked-map";

export class Core<TStream extends Stream = Stream> {
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private readonly settings: Settings = {
    simultaneousHttpDownloads: 3,
    highDemandBufferLength: 20,
    httpBufferLength: 60,
    p2pBufferLength: 60,
    cachedSegmentExpiration: 120,
    cachedSegmentsCount: 50,
  };
  private position = 0;
  private readonly mainStreamLoader = new HybridLoader(this.settings);
  private readonly secondaryStreamLoader = new HybridLoader(this.settings);

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
    if (firstSegment && firstSegment.startTime > this.position) {
      this.position = firstSegment.startTime;
      this.mainStreamLoader.updatePlayback(firstSegment.startTime);
      this.secondaryStreamLoader.updatePlayback(firstSegment.startTime);
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
    this.mainStreamLoader.updatePlayback(position, rate);
    this.secondaryStreamLoader.updatePlayback(position, rate);
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
}
