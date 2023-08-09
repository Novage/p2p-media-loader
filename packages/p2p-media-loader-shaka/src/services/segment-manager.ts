import { Segment, Stream } from "./segment";
import { HookedStream, StreamInfo, StreamType } from "../types/types";
import { Core, ReadonlyStream } from "p2p-media-loader-core";

export class SegmentManager {
  private manifestUrl?: string;
  private readonly streamInfo: StreamInfo;
  private readonly core: Core<Segment, Stream>;

  constructor(streamInfo: StreamInfo, core: Core<Segment, Stream>) {
    this.streamInfo = streamInfo;
    this.core = core;
  }

  setManifestUrl(url: string) {
    this.manifestUrl = url.split("?")[0];
  }

  setStream(stream: HookedStream, streamOrder = -1) {
    if (!this.manifestUrl) return;

    const managerStream = new Stream({
      localId: stream.id.toString(),
      order: streamOrder,
      type: stream.type as StreamType,
      manifestUrl: this.manifestUrl,
      url: stream.streamUrl,
      shakaStream: stream,
    });
    this.core.addStream(managerStream);

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
    managerStream: ReadonlyStream<Segment, Stream>,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    const stream = managerStream.shakaStream;
    const newSegments: Segment[] = [];
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
        newSegments.push(segment);
      }
      staleSegmentsIds.delete(segmentLocalId);
    }

    this.core.updateStream(managerStream.localId, newSegments, [
      ...staleSegmentsIds,
    ]);
  }

  private processHlsSegmentReferences(
    managerStream: ReadonlyStream<Segment, Stream>,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const segments = [...managerStream.segments.values()];
    const stream = managerStream.shakaStream;
    const lastMediaSequence = managerStream.getLastMediaSequence();

    const newSegments: Segment[] = [];
    if (segments.length === 0) {
      const firstMediaSequence =
        lastMediaSequence === undefined
          ? 0
          : lastMediaSequence - segmentReferences.length + 1;
      segmentReferences.forEach((reference, index) => {
        const segment = Segment.create({
          stream,
          segmentReference: reference,
          index: firstMediaSequence + index,
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
      const localId = Segment.getLocalIdFromSegmentReference(reference);
      if (!managerStream.segments.has(localId)) {
        const segment = Segment.create({
          localId,
          stream,
          segmentReference: reference,
          index,
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

  destroy() {
    this.manifestUrl = undefined;
  }
}
