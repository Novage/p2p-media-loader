import { Segment, Stream } from "./segment";

export class SegmentManager {
  streams: Map<number, Stream> = new Map();

  setStream(stream: shaka.extern.Stream) {
    let managerStream = this.streams.get(stream.id);
    if (!managerStream) {
      managerStream = new Stream(stream.id);
      this.streams.set(managerStream.id, managerStream);
    }

    const { segmentIndex } = stream;
    if (!segmentIndex) return;
    for (const segmentReference of segmentIndex) {
      const segment = Segment.create(stream, segmentReference);
      managerStream.segments.set(segment.localId, segment);
    }
  }

  getSegment(segmentLocalId: string) {
    for (const stream of this.streams.values()) {
      const segment = stream.segments.get(segmentLocalId);
      if (segment) return segment;
    }
  }
}
