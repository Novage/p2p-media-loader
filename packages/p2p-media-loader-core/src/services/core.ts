import { Loader } from "./loader";
import {
  Stream,
  ReadonlyStream,
  Segment,
  SegmentResponse,
  Playback,
} from "../types";

export class Core<TStream extends Stream = Stream> {
  private readonly streams = new Map<string, TStream>();
  private readonly playback: Playback = { position: 0, rate: 1 };
  private readonly loader: Loader = new Loader(this.streams);

  setManifestResponseUrl(url: string): void {
    this.loader.setManifestResponseUrl(url.split("?")[0]);
  }

  hasSegment(segmentLocalId: string): boolean {
    return this.streams.has(segmentLocalId);
  }

  getStreamByUrl(streamUrl: string): ReadonlyStream<TStream> | undefined {
    for (const stream of this.streams.values()) {
      if (stream.url === streamUrl) return stream;
    }
  }

  getStream(streamLocalId: string): ReadonlyStream<TStream> | undefined {
    return this.streams.get(streamLocalId);
  }

  addStreamIfNoneExists(stream: TStream): void {
    if (this.streams.has(stream.localId)) return;
    this.streams.set(stream.localId, stream);
  }

  updateStream(
    streamLocalId: string,
    addSegments?: Segment[],
    removeSegmentIds?: string[]
  ): void {
    const stream = this.streams.get(streamLocalId);
    if (!stream) return;

    addSegments?.forEach((s) => stream.segments.set(s.localId, s));
    removeSegmentIds?.forEach((id) => stream.segments.delete(id));
  }

  loadSegment(segmentLocalId: string): Promise<SegmentResponse> {
    return this.loader.loadSegment(segmentLocalId);
  }

  abortSegmentLoading(segmentId: string): void {
    return this.loader.abortSegment(segmentId);
  }

  updatePlayback({
    position,
    rate,
  }: {
    rate?: number;
    position?: number;
  }): void {
    if (position !== undefined) this.playback.position = position;
    if (rate !== undefined) this.playback.rate = rate;
  }

  destroy(): void {
    this.streams.clear();
  }
}
