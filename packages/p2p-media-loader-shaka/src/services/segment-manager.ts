import * as Utils from "./stream-utils";
import { HookedStream, StreamInfo, StreamType, Stream } from "../types/types";
import { Core, ReadonlyStream, Segment } from "p2p-media-loader-core";

export class SegmentManager {
  private readonly streamInfo: Readonly<StreamInfo>;
  private readonly core: Core<Stream>;

  constructor(streamInfo: Readonly<StreamInfo>, core: Core<Stream>) {
    this.streamInfo = streamInfo;
    this.core = core;
  }

  setStream(stream: HookedStream, index = -1) {
    const managerStream: Stream = {
      localId: stream.id.toString(),
      type: stream.type as StreamType,
      url: stream.streamUrl,
      shakaStream: stream,
      index,
      segments: new Map(),
    };
    this.core.addStreamIfNoneExists(managerStream);

    return managerStream;
  }

  updateStream(
    stream: HookedStream,
    segmentReferences?: shaka.media.SegmentReference[]
  ) {
    let managerStream = this.core.getStream(stream.id.toString());
    if (!managerStream) managerStream = this.setStream(stream);
    if (!managerStream) return;

    const { segmentIndex } = stream;
    let references = segmentReferences;
    if (!references && segmentIndex) {
      try {
        references = [...segmentIndex];
      } catch (err) {
        return;
      }
    }
    if (!references) return;

    if (this.streamInfo.protocol === "hls") {
      this.processHlsSegmentReferences(managerStream, references);
    } else {
      this.processDashSegmentReferences(managerStream, references);
    }
  }

  updateHlsStreamByUrl(url: string) {
    const stream = this.core.getStreamByUrl(url);
    if (!stream || !stream.shakaStream) return;
    this.updateStream(stream.shakaStream);
  }

  private processDashSegmentReferences(
    managerStream: ReadonlyStream<Stream>,
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
    managerStream: ReadonlyStream<Stream>,
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
