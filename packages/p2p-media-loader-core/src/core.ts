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
    highDemandTimeWindow: 25,
    httpDownloadTimeWindow: 60,
    p2pDownloadTimeWindow: 60,
    cachedSegmentExpiration: 120,
    cachedSegmentsCount: 50,
  };
  private readonly bandwidthApproximator = new BandwidthApproximator();
  private readonly mainStreamLoader: HybridLoader = new HybridLoader(
    this.settings,
    this.bandwidthApproximator
  );
  private secondaryStreamLoader?: HybridLoader;

  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = url.split("?")[0];
    this.mainStreamLoader.setStreamManifestUrl(this.manifestResponseUrl);
    this.secondaryStreamLoader?.setStreamManifestUrl(this.manifestResponseUrl);
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

    let loader: HybridLoader;
    if (stream.type === "main") {
      loader = this.mainStreamLoader;
    } else {
      this.secondaryStreamLoader =
        this.secondaryStreamLoader ??
        new HybridLoader(this.settings, this.bandwidthApproximator);
      loader = this.secondaryStreamLoader;
    }
    return loader.loadSegmentByEngine(segment, stream);
  }

  abortSegmentLoading(segmentId: string): void {
    this.mainStreamLoader.abortSegmentByEngine(segmentId);
    this.secondaryStreamLoader?.abortSegmentByEngine(segmentId);
  }

  updatePlayback(position: number, rate: number): void {
    this.mainStreamLoader.updatePlayback(position, rate);
    this.secondaryStreamLoader?.updatePlayback(position, rate);
  }

  destroy(): void {
    this.streams.clear();
    this.mainStreamLoader.destroy();
    this.secondaryStreamLoader?.destroy();
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
