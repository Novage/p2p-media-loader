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

    console.log(
      Array.from(managerStream.segments.values()).map((s) => s.index)
    );
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
      const index = reference.getStartTime();

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
    // console.log("MEDIA SEQUENCE: ", this.streamInfo.mediaSequence.video);
    // console.log(
    //   segmentReferences.map((s) => Segment.getLocalIdFromSegmentReference(s))
    // );
    const mediaSequence =
      stream.type === "video"
        ? this.streamInfo.mediaSequence.video
        : this.streamInfo.mediaSequence.audio;

    const segments = Array.from(managerStream.segments.values());
    const lastSegmentIndex = segments[segments.length - 1]?.index ?? -1;

    let staleSegmentsIds: string[] = [];
    if (mediaSequence > lastSegmentIndex) {
      staleSegmentsIds = segments.map((s) => s.localId);
    } else {
      for (const segment of segments) {
        if (segment.index < mediaSequence) {
          staleSegmentsIds.push(segment.localId);
        } else {
          break;
        }
      }
    }

    const staleSegmentsIdsSet = new Set(staleSegmentsIds);
    let sequence = Math.max(lastSegmentIndex + 1, mediaSequence);
    for (const reference of segmentReferences) {
      const segmentLocalId = Segment.getLocalIdFromSegmentReference(reference);
      const segment = managerStream.segments.get(segmentLocalId);
      if (!segment) {
        const segment = Segment.create({
          stream,
          segmentReference: reference,
          index: sequence,
          localId: segmentLocalId,
        });
        managerStream.segments.set(segment.localId, segment);
        sequence++;
      }
    }

    // console.log(
    //   Array.from(managerStream.segments.values()).map((i) => i.index)
    // );

    return staleSegmentsIdsSet;
  }
}
