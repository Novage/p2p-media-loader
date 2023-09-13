import { HybridLoader } from "./hybrid-loader";
import {
  Stream,
  StreamWithSegments,
  Segment,
  SegmentResponse,
  Settings,
} from "./types";
import * as Utils from "./utils";
import { LinkedMap } from "./linked-map";
import { BandwidthApproximator } from "./bandwidth-approximator";

export class Core<TStream extends Stream = Stream> {
  private manifestResponseUrl?: string;
  private readonly streams = new Map<string, StreamWithSegments<TStream>>();
  private readonly settings: Settings = {
    simultaneousHttpDownloads: 3,
    highDemandBufferLength: 25,
    httpBufferLength: 60,
    p2pBufferLength: 60,
    cachedSegmentExpiration: 120,
    cachedSegmentsCount: 50,
  };
  private readonly bandwidthApproximator = new BandwidthApproximator();
  private readonly mainStreamLoader = new HybridLoader(
    this.settings,
    this.bandwidthApproximator
  );
  private readonly secondaryStreamLoader = new HybridLoader(
    this.settings,
    this.bandwidthApproximator
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

    // TODO: update playback position when the live stream is updated
  }

  destroy(): void {
    this.streams.clear();
    this.mainStreamLoader.clear();
    this.secondaryStreamLoader.clear();
    this.manifestResponseUrl = undefined;
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
