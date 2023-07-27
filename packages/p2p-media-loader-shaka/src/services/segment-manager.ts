import { Segment, Stream } from "./segment";
import { HookedStream, StreamInfo, StreamType } from "../types/types";

export class SegmentManager {
  private manifestUrl?: string;
  readonly streams: Map<number, Stream> = new Map();
  readonly urlStreamMap: Map<string, Stream> = new Map();
  readonly streamInfo: StreamInfo;
  // timeLoadedSegmentMap: Map<number, Segment> = new Map();
  loadedSegments: Segment[] = [];
  playheadTime?: number;
  prevLoadedSegment?: Segment;

  private currentSegment?: Segment;

  constructor(streamInfo: StreamInfo) {
    this.streamInfo = streamInfo;
  }

  setManifestUrl(url: string) {
    this.manifestUrl = url.split("?")[0];
  }

  setStream({
    stream,
    streamOrder = -1,
  }: {
    stream: HookedStream;
    streamOrder?: number;
  }) {
    if (!this.manifestUrl || this.streams.has(stream.id)) return;

    const managerStream = new Stream({
      localId: stream.id,
      order: streamOrder,
      type: stream.type as StreamType,
      manifestUrl: this.manifestUrl,
      url: stream.streamUrl,
      shakaStream: stream,
    });
    this.streams.set(managerStream.localId, managerStream);
    if (this.streamInfo.protocol === "hls" && managerStream.url) {
      this.urlStreamMap.set(managerStream.url, managerStream);
    }

    return managerStream;
  }

  updateStream({
    stream,
    segmentReferences,
  }: {
    stream: HookedStream;
    segmentReferences?: shaka.media.SegmentReference[];
  }) {
    let managerStream = this.streams.get(stream.id);
    if (!managerStream) managerStream = this.setStream({ stream });
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

  updateHLSStreamByUrl(url: string) {
    const stream = this.urlStreamMap.get(url);
    if (!stream || !stream.shakaStream) return;
    this.updateStream({ stream: stream.shakaStream });
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
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    const stream = managerStream.shakaStream;
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

    for (const id of staleSegmentsIds) managerStream.segments.delete(id);
  }

  private processHlsSegmentReferences(
    managerStream: Stream,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const segments = [...managerStream.segments.values()];
    const stream = managerStream.shakaStream;
    const lastMediaSequence = managerStream.getLastMediaSequence();

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
        managerStream.segments.set(segment.localId, segment);
      });
      return;
    }

    let index = lastMediaSequence ?? 0;
    const startSize = managerStream.segments.size;

    const newSegments: Segment[] = [];
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
    newSegments.forEach((s) => managerStream.segments.set(s.localId, s));

    const deleteCount = managerStream.segments.size - startSize;
    for (let i = 0; i < deleteCount; i++) {
      const segment = segments[i];
      managerStream.segments.delete(segment.localId);
    }
  }

  destroy() {
    this.manifestUrl = undefined;
    this.streams.clear();
    this.urlStreamMap.clear();
  }

  addLoadedSegment(segmentLocalId: string) {
    const segment = this.getSegment(segmentLocalId);
    if (!segment) return;

    const prevSegmentEndTime = this.prevLoadedSegment?.endTime;
    const { startTime } = segment;
    // if (!this.timeLoadedSegmentMap.has(startTime)) {
    //   if (prevSegmentEndTime !== startTime) {
    //     this.timeLoadedSegmentMap.clear();
    //     this.loadedSegments = [];
    //   }
    //   this.timeLoadedSegmentMap.set(segment.startTime, segment);
    //   this.loadedSegments.push(segment);
    // } else {
    //   const index = this.loadedSegments.findIndex(
    //     (s) => s.startTime === startTime
    //   );
    //   this.loadedSegments[index] = segment;
    // }

    if (prevSegmentEndTime !== startTime) this.loadedSegments = [];
    this.loadedSegments.push(segment);
  }

  updatePlayheadTime(playheadTime: number) {
    this.playheadTime = playheadTime;
    if (
      this.currentSegment &&
      playheadTime >= this.currentSegment.startTime &&
      playheadTime < this.currentSegment.endTime
    ) {
      return;
    }

    const start =
    while () {
      let mid = Math.floor((start + end) / 2);
    }
  }
}

function binarySearch(list: unknown[], condition: (segment: Segment) => boolean) {
  let start = 0;
  let end = list.length - 1;
  while (start <= end) {
    let mid = Math.floor((start + end) / 2);
  }
}

// class Playback {
//   private segment: Segment;
//
//   constructor(segment: Segment) {
//     this.segment = segment;
//   }
// }
