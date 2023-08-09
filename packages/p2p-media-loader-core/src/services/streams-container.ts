import { Segment, Stream } from "../types";

export class StreamsContainer<
  Sgm extends Segment = Segment,
  Str extends Stream<Sgm> = Stream<Sgm>
> {
  private readonly streams: Map<string, Str> = new Map();

  addStream(playlistId: string, playlist: Str) {
    if (this.streams.has(playlistId)) return;
    this.streams.set(playlistId, playlist);
  }

  getStream(playlistId: string) {
    return this.streams.get(playlistId);
  }

  getSegment(segmentId: string) {
    for (const stream of this.streams.values()) {
      const segment = stream.segments.get(segmentId);
      if (segment) return segment;
    }
  }

  getStreamByUrl(url: string) {
    return [...this.streams.values()].find((s) => s.url === url);
  }

  hasSegment(segmentId: string) {
    for (const stream of this.streams.values()) {
      if (stream.segments.has(segmentId)) return true;
    }
    return false;
  }

  clear() {
    this.streams.clear();
  }
}
