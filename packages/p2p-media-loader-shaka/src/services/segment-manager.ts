import { Segment, Stream } from "./segment";
import { HookedStream, StreamInfo, StreamType } from "../types/types";

export class SegmentManager {
  private manifestUrl?: string;
  readonly streams: Map<number, Stream> = new Map();
  readonly urlStreamMap: Map<string, Stream> = new Map();
  readonly streamInfo: StreamInfo;
  readonly videoPlayback = new Playback();
  readonly audioPlayback = new Playback();

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

    let staleSegmentIds: string[];
    if (this.streamInfo.protocol === "hls") {
      staleSegmentIds =
        this.processHlsSegmentReferences(managerStream, references) ?? [];
    } else {
      staleSegmentIds = this.processDashSegmentReferences(
        managerStream,
        references
      );
    }

    const deleteStaleFromPlayback =
      managerStream.type === "video"
        ? (segment: Segment) => this.videoPlayback.deleteStaleSegment(segment)
        : (segment: Segment) => this.audioPlayback.deleteStaleSegment(segment);

    for (const id of staleSegmentIds) {
      const segment = managerStream.segments.get(id);
      managerStream.segments.delete(id);
      if (!segment) continue;
      deleteStaleFromPlayback(segment);
    }

    // console.log(
    //   managerStream.localId,
    //   managerStream.type,
    //   [...managerStream.segments.values()].map((i) => {
    //     return {
    //       i: i.index,
    //       start: i.startTime,
    //       end: i.endTime,
    //     };
    //   })
    // );
  }

  private processDashSegmentReferences(
    managerStream: Stream,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentsIds = new Set(managerStream.segments.keys());
    const stream = managerStream.shakaStream;
    const isLive = this.streamInfo.isLive;
    for (const [i, reference] of segmentReferences.entries()) {
      const index = !isLive ? i : reference.getStartTime();

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
    return [...staleSegmentsIds];
  }

  private processHlsSegmentReferences(
    managerStream: Stream,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const stream = managerStream.shakaStream;
    const lastMediaSequence = managerStream.getLastMediaSequence();

    if (managerStream.segments.size === 0) {
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

    const segments = [...managerStream.segments.values()];
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
    const staleSegmentIds: string[] = [];
    for (let i = 0; i < deleteCount; i++) {
      staleSegmentIds.push(segments[i].localId);
    }

    return staleSegmentIds;
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

  destroy() {
    this.manifestUrl = undefined;
    this.streams.clear();
    this.urlStreamMap.clear();
  }

  addLoadedSegment(segmentLocalId: string) {
    const segment = this.getSegment(segmentLocalId);
    const stream = this.getStreamBySegmentLocalId(segmentLocalId);
    if (!stream || !segment) return;

    if (stream.type === "video") this.videoPlayback.addLoadedSegment(segment);
    // else this.audioPlayback.addLoadedSegment(segment);
  }

  updatePlayheadTime(playheadTime: number) {
    this.videoPlayback.setPlayheadTime(playheadTime);
    // this.audioPlayback.setPlayheadTime(playheadTime);
  }
}

class Playback {
  public playheadTime = 0;
  public playheadSegment?: Segment;
  private readonly loadedSegmentsMap: Map<number, Segment> = new Map();

  setPlayheadTime(playheadTime: number) {
    this.playheadTime = playheadTime;
    if (!this.loadedSegmentsMap.size) return;

    if (
      this.playheadSegment &&
      playheadTime >= this.playheadSegment.startTime &&
      playheadTime < this.playheadSegment.endTime
    ) {
      return;
    }

    const playheadSegmentIndex = this.playheadSegment?.index;
    const nextSegment =
      playheadSegmentIndex !== undefined &&
      this.loadedSegmentsMap.get(playheadSegmentIndex + 1);

    console.log(this.loadedSegmentsMap);

    if (
      nextSegment &&
      playheadTime >= nextSegment.startTime &&
      playheadTime < nextSegment.endTime
    ) {
      console.log("NEXT", nextSegment.index);
      this.playheadSegment = nextSegment;
      return;
    }

    const loadedSegments = [...this.loadedSegmentsMap.values()];

    let left = 0;
    let right = loadedSegments.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const segment = loadedSegments[mid];
      const { startTime, endTime } = segment;
      if (playheadTime >= startTime && playheadTime < endTime) {
        this.playheadSegment = segment;
        break;
      } else if (playheadTime < startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
  }

  addLoadedSegment(segment: Segment) {
    this.loadedSegmentsMap.set(segment.index, segment);
  }

  deleteStaleSegment(segment: Segment) {
    this.loadedSegmentsMap.delete(segment.index);
  }
}
