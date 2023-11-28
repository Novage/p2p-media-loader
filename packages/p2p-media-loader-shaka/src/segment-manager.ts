import * as Utils from "./stream-utils";
import { HookedStream, StreamInfo, Stream } from "./types";
import {
  Core,
  StreamWithReadonlySegments,
  SegmentBase,
  StreamType,
} from "p2p-media-loader-core";

export class SegmentManager {
  private readonly core: Core<Stream>;
  private streamInfo: Readonly<StreamInfo>;

  constructor(streamInfo: Readonly<StreamInfo>, core: Core<Stream>) {
    this.core = core;
    this.streamInfo = streamInfo;
  }

  setStream(shakaStream: HookedStream, type: StreamType, index = -1) {
    const localId = Utils.getStreamLocalIdFromShakaStream(
      shakaStream,
      this.streamInfo.protocol === "hls"
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
        segmentReferences = [...segmentIndex];
      } catch (err) {
        return;
      }
    }
    if (!segmentReferences) return;

    if (this.streamInfo.protocol === "hls") {
      this.processHlsSegmentReferences(stream, segmentReferences);
    } else {
      this.processDashSegmentReferences(stream, segmentReferences);
    }
  }

  private processDashSegmentReferences(
    managerStream: StreamWithReadonlySegments<Stream>,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    const newSegments: SegmentBase[] = [];
    for (const reference of segmentReferences) {
      const externalId = Math.trunc(reference.getStartTime()).toString();

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
    managerStream: StreamWithReadonlySegments<Stream>,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const segments = [...managerStream.segments.values()];
    const lastMediaSequence = Utils.getStreamLastMediaSequence(managerStream);

    const newSegments: SegmentBase[] = [];
    if (segments.length === 0) {
      const firstReferenceMediaSequence =
        lastMediaSequence === undefined
          ? 0
          : lastMediaSequence - segmentReferences.length + 1;
      segmentReferences.forEach((reference, index) => {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId: (firstReferenceMediaSequence + index).toString(),
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
          externalId: index.toString(),
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
