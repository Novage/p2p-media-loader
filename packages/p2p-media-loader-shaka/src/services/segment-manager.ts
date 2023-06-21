import { Segment, Stream, StreamType } from "./segment";

export class SegmentManager {
  private manifestUrl?: string;
  readonly streams: Map<number, Stream> = new Map();

  setManifestUrl(url: string) {
    this.manifestUrl = url.split("?")[0];
  }

  setStream(stream: shaka.extern.Stream, order: number) {
    if (!this.manifestUrl) return;

    let managerStream = this.streams.get(stream.id);
    if (!managerStream) {
      managerStream = new Stream({
        localId: stream.id,
        order,
        type: stream.type as StreamType,
        manifestUrl: this.manifestUrl,
      });
      this.streams.set(managerStream.localId, managerStream);
    }

    const { segmentIndex } = stream;
    if (!segmentIndex) return;
    for (const segmentReference of segmentIndex) {
      const segment = Segment.create(stream, segmentReference);
      managerStream.segments.set(segment.localId, segment);
    }
  }

  getSegment(segmentLocalId: string) {
    const stream = this.getStreamBySegmentLocalId(segmentLocalId);
    return stream?.segments.get(segmentLocalId);
  }

  getStreamBySegmentLocalId(segmentLocalId: string) {
    for (const stream of this.streams.values()) {
      if (stream.segments.has(segmentLocalId)) return stream;
    }
  }
}
