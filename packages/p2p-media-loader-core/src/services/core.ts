import { Loader } from "./loader";
import { Stream, ReadonlyStream, Segment } from "../types";

export class Core<TStream extends Stream = Stream> {
  private readonly streams: Map<string, TStream> = new Map();
  private readonly loader: Loader = new Loader(this.streams);
  private readonly playback: Playback = new Playback();
  private manifestResponseUrl?: string;

  setManifestResponseUrl(url: string): void {
    this.manifestResponseUrl = url.split("?")[0];
    this.loader.setManifestResponseUrl(this.manifestResponseUrl);
  }

  hasSegment(segmentLocalId: string): boolean {
    return this.streams.has(segmentLocalId);
  }

  getStreamByUrl(streamUrl: string): ReadonlyStream<TStream> | undefined {
    return [...this.streams.values()].find((s) => s.url === streamUrl);
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

  // TODO: response type
  loadSegment(segmentLocalId: string) {
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

class Playback {
  position = 0;
  rate = 1;
}
