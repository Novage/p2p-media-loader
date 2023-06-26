import { Segment, Stream, StreamType } from "./segment";
import { StreamInfo } from "../types/types";

export class SegmentManager {
  private manifestUrl?: string;
  readonly streams: Map<number, Stream> = new Map();
  readonly streamInfo: StreamInfo;

  constructor(streamInfo: StreamInfo) {
    this.streamInfo = streamInfo;
  }

  setManifestUrl(url: string) {
    this.manifestUrl = url.split("?")[0];
  }

  setStream(stream: shaka.extern.Stream, order: number) {
    if (!this.manifestUrl) return;

    if (this.streamInfo.protocol === "hls") {
      // console.log(this.streamInfo);
    }

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
    // console.log(segmentIndex.getIteratorForTime(13)?.currentPosition());
    for (const segmentReference of segmentIndex) {
      console.log(segmentReference, (segmentReference as any).ag());
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
