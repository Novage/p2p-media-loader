import * as Utils from "./stream-utils";
import {
  HookedStream,
  StreamInfo,
  Stream,
  StreamWithReadonlySegments,
} from "./types";
import { Core, Segment, StreamType } from "p2p-media-loader-core";

// The minimum time interval (in seconds) between segments to assign unique IDs.
// If two segments in the same playlist start within a time frame shorter than this interval,
// they risk being assigned the same ID.
// Such overlapping IDs can lead to potential conflicts or issues in segment processing.
const SEGMENT_ID_RESOLUTION_IN_SECONDS = 0.5;

export class SegmentManager {
  private readonly core: Core<Stream>;
  private streamInfo: Readonly<StreamInfo>;

  constructor(streamInfo: Readonly<StreamInfo>, core: Core<Stream>) {
    this.core = core;
    this.streamInfo = streamInfo;
  }

  setStream(shakaStream: HookedStream, type: StreamType, index = -1) {
    this.core.addStreamIfNoneExists({
      runtimeId: shakaStream.id.toString(),
      type,
      index,
      shakaStream,
    });
    if (shakaStream.segmentIndex) this.updateStreamSegments(shakaStream);
  }

  updateStreamSegments(
    shakaStream: HookedStream,
    segmentReferences?: shaka.media.SegmentReference[],
  ) {
    const stream = this.core.getStream(shakaStream.id.toString());
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
    managerStream: StreamWithReadonlySegments,
    segmentReferences: shaka.media.SegmentReference[],
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    const newSegments: Segment[] = [];
    for (const reference of segmentReferences) {
      const externalId = Math.trunc(
        reference.getStartTime() / SEGMENT_ID_RESOLUTION_IN_SECONDS,
      );

      const runtimeId = Utils.getSegmentRuntimeIdFromReference(reference);
      if (!managerStream.segments.has(runtimeId)) {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId,
          runtimeId,
        });
        newSegments.push(segment);
      }
      staleSegmentsIds.delete(runtimeId);
    }

    if (!newSegments.length && !staleSegmentsIds.size) return;
    this.core.updateStream(
      managerStream.runtimeId,
      newSegments,
      staleSegmentsIds.values(),
    );
  }

  private processHlsSegmentReferences(
    managerStream: StreamWithReadonlySegments,
    segmentReferences: shaka.media.SegmentReference[],
  ) {
    const { segments } = managerStream;
    const lastMediaSequence = Utils.getStreamLastMediaSequence(managerStream);

    const newSegments: Segment[] = [];
    if (segments.size === 0) {
      const firstReferenceMediaSequence =
        lastMediaSequence === undefined
          ? 0
          : lastMediaSequence - segmentReferences.length + 1;

      for (const [index, reference] of segmentReferences.entries()) {
        const segment = Utils.createSegment({
          segmentReference: reference,
          externalId: firstReferenceMediaSequence + index,
        });
        newSegments.push(segment);
      }
      this.core.updateStream(managerStream.runtimeId, newSegments);
      return;
    }

    if (!lastMediaSequence) return;
    let mediaSequence = lastMediaSequence;

    for (const reference of itemsBackwards(segmentReferences)) {
      const runtimeId = Utils.getSegmentRuntimeIdFromReference(reference);
      if (segments.has(runtimeId)) break;
      const segment = Utils.createSegment({
        runtimeId,
        segmentReference: reference,
        externalId: mediaSequence,
      });
      newSegments.push(segment);
      mediaSequence--;
    }
    newSegments.reverse();

    const staleSegmentIds: string[] = [];
    const countToDelete = newSegments.length;
    for (const segment of nSegmentsBackwards(segments, countToDelete)) {
      staleSegmentIds.push(segment.runtimeId);
    }

    if (!newSegments.length && !staleSegmentIds.length) return;
    this.core.updateStream(
      managerStream.runtimeId,
      newSegments,
      staleSegmentIds,
    );
  }
}

function* itemsBackwards<T>(items: T[]) {
  for (let i = items.length - 1; i >= 0; i--) yield items[i];
}

function* nSegmentsBackwards(
  segments: ReadonlyMap<string, Segment>,
  count: number,
) {
  let i = 0;
  for (const segment of segments.values()) {
    if (i >= count) break;
    yield segment;
    i++;
  }
}
