import * as Utils from "./stream-utils";
import { HookedStream, StreamInfo, Stream } from "./types";
import {
  Core,
  StreamWithSegments,
  Segment,
  StreamType,
} from "p2p-media-loader-core";

export class SegmentManager {
  private readonly core: Core<Stream>;
  private readonly isHls: boolean;

  constructor(streamInfo: Readonly<StreamInfo>, core: Core<Stream>) {
    this.core = core;
    this.isHls = streamInfo.protocol === "hls";
  }

  setStream(shakaStream: HookedStream, type: StreamType, index = -1) {
    const localId = Utils.getStreamLocalIdFromShakaStream(
      shakaStream,
      this.isHls
    );

    this.core.addStreamIfNoneExists({
      localId,
      type,
      index,
      shakaStream,
    });

    if (shakaStream.segmentIndex) this.updateStreamSegments(localId);
  }

  updateStreamSegments(
    streamLocalId: string,
    segmentReferences?: shaka.media.SegmentReference[]
  ) {
    const stream = this.core.getStream(streamLocalId);
    if (!stream) return;

    const { segmentIndex } = stream.shakaStream;
    if (!segmentReferences && segmentIndex) {
      try {
        return [...segmentIndex];
      } catch (err) {
        return;
      }
    }
    if (!segmentReferences) return;

    if (this.isHls) {
      this.processHlsSegmentReferences(stream, segmentReferences);
    } else {
      this.processDashSegmentReferences(stream, segmentReferences);
    }
  }

  private processDashSegmentReferences(
    managerStream: StreamWithSegments<Stream>,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    const newSegments: Segment[] = [];
    for (const reference of segmentReferences) {
      const externalId = reference.getStartTime();

      const segmentLocalId = Utils.getSegmentLocalIdFromReference(reference);
      if (!managerStream.segments.has(segmentLocalId)) {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId,
          localId: segmentLocalId,
        });
        newSegments.push(segment);
      }
      staleSegmentsIds.delete(segmentLocalId);
    }

    this.core.updateStream(managerStream.localId, newSegments, [
      ...staleSegmentsIds,
    ]);
  }

  private processHlsSegmentReferences(
    managerStream: StreamWithSegments<Stream>,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const segments = [...managerStream.segments.values()];
    const lastMediaSequence = Utils.getStreamLastMediaSequence(managerStream);

    const newSegments: Segment[] = [];
    if (segments.length === 0) {
      const firstReferenceMediaSequence =
        lastMediaSequence === undefined
          ? 0
          : lastMediaSequence - segmentReferences.length + 1;
      segmentReferences.forEach((reference, index) => {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId: firstReferenceMediaSequence + index,
        });
        newSegments.push(segment);
      });
      this.core.updateStream(managerStream.localId, newSegments);
      return;
    }

    let index = lastMediaSequence ?? 0;
    const startSize = managerStream.segments.size;

    for (let i = segmentReferences.length - 1; i >= 0; i--) {
      const reference = segmentReferences[i];
      const localId = Utils.getSegmentLocalIdFromReference(reference);
      if (!managerStream.segments.has(localId)) {
        const segment = Utils.createSegment({
          localId,
          segmentReference: reference,
          externalId: index,
        });
        newSegments.push(segment);
        index--;
      } else {
        break;
      }
    }
    newSegments.reverse();

    const deleteCount = managerStream.segments.size - startSize;
    const staleSegmentIds: string[] = [];
    for (let i = 0; i < deleteCount; i++) {
      const segment = segments[i];
      staleSegmentIds.push(segment.localId);
    }
    this.core.updateStream(managerStream.localId, newSegments, staleSegmentIds);
  }
}
