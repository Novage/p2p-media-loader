import { Segment, Stream } from "./segment";
import { StreamInfo, StreamType } from "../types/types";

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

  setStream({
    stream,
    streamOrder = -1,
    segmentReferences,
  }: {
    stream: shaka.extern.Stream;
    segmentReferences?: shaka.media.SegmentReference[];
    streamOrder?: number;
  }) {
    if (!this.manifestUrl) return;

    let managerStream = this.streams.get(stream.id);
    if (!managerStream) {
      managerStream = new Stream({
        localId: stream.id,
        order: streamOrder,
        type: stream.type as StreamType,
        manifestUrl: this.manifestUrl,
      });
      this.streams.set(managerStream.localId, managerStream);
    }

    const { segmentIndex } = stream;
    const references =
      segmentReferences ?? (segmentIndex && Array.from(segmentIndex));
    if (!references) return;

    let staleSegmentsIds: Set<string>;

    if (this.streamInfo.protocol === "hls") {
      staleSegmentsIds = this.processHlsSegmentReferences(
        managerStream,
        stream,
        references
      );
    } else {
      staleSegmentsIds = this.processDashSegmentReferences(
        managerStream,
        stream,
        references
      );
    }

    for (const id of staleSegmentsIds) managerStream.segments.delete(id);
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

  private processDashSegmentReferences(
    managerStream: Stream,
    stream: shaka.extern.Stream,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    for (const reference of segmentReferences) {
      const index = reference.getStartByte();

      const segmentLocalId = Segment.getLocalIdFromSegmentReference(reference);
      if (!managerStream.segments.has(segmentLocalId)) {
        const segment = Segment.create({
          stream,
          segmentReference: reference,
          index,
          localId: segmentLocalId,
        });
        managerStream.segments.set(segment.localId, segment);
      }
      staleSegmentsIds.delete(segmentLocalId);
    }

    return staleSegmentsIds;
  }

  private processHlsSegmentReferences(
    managerStream: Stream,
    stream: shaka.extern.Stream,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    let index =
      stream.type === "video"
        ? this.streamInfo.mediaSequence.video
        : this.streamInfo.mediaSequence.audio;
    const staleSegmentsIds = new Set(managerStream.segments.keys());

    for (let i = 0; i < segmentReferences.length; i++) {
      const reference = segmentReferences[i];

      const segmentLocalId = Segment.getLocalIdFromSegmentReference(reference);
      const segment = managerStream.segments.get(segmentLocalId);
      if (!segment) {
        const segment = Segment.create({
          stream,
          segmentReference: reference,
          index,
          localId: segmentLocalId,
        });
        managerStream.segments.set(segment.localId, segment);
      } else if (i === 0) {
        index = segment.index;
      }
      index++;
      staleSegmentsIds.delete(segmentLocalId);
    }
    return staleSegmentsIds;
  }
}
