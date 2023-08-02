import { Segment, Stream } from "./segment";
import { Playback } from "common";
import { HookedStream, StreamInfo, StreamType } from "../types/types";

export class SegmentManager {
  private manifestUrl?: string;
  readonly streams: Map<number, Stream> = new Map();
  readonly urlStreamMap: Map<string, Stream> = new Map();
  readonly streamInfo: StreamInfo;
  videoPlayback!: Playback<Segment>;
  audioPlayback!: Playback<Segment>;
  private isDashLive = false;

  constructor(streamInfo: StreamInfo) {
    this.streamInfo = streamInfo;
  }

  initialized() {
    const { isLive, protocol } = this.streamInfo;
    const isDashLive = isLive && protocol === "dash";
    this.videoPlayback = new Playback(isDashLive);
    this.audioPlayback = new Playback(isDashLive);
    this.isDashLive = isDashLive;
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

  updateHlsStreamByUrl(url: string) {
    const stream = this.urlStreamMap.get(url);
    if (!stream || !stream.shakaStream) return;
    this.updateStream({ stream: stream.shakaStream });
  }

  private processDashSegmentReferences(
    managerStream: Stream,
    segmentReferences: shaka.media.SegmentReference[]
  ) {
    const staleSegmentIds = new Set(managerStream.segments.keys());
    const stream = managerStream.shakaStream;
    let firstSegmentStartTime: number | undefined;
    for (const [index, reference] of segmentReferences.entries()) {
      const segmentIndex = !this.isDashLive ? index : reference.getStartTime();

      const segmentLocalId = Segment.getLocalIdFromSegmentReference(reference);
      if (!managerStream.segments.has(segmentLocalId)) {
        const segment = Segment.create({
          stream,
          segmentReference: reference,
          index: segmentIndex,
          localId: segmentLocalId,
        });
        if (index === 0) firstSegmentStartTime = segment.startTime;
        managerStream.segments.set(segment.localId, segment);
      }
      staleSegmentIds.delete(segmentLocalId);
    }

    this.removeStaleSegments({
      stream: managerStream,
      staleSegmentIds: [...staleSegmentIds],
      removeBeforeTime: firstSegmentStartTime,
    });
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

    this.removeStaleSegments({
      stream: managerStream,
      staleSegmentIds,
    });
  }

  private removeStaleSegments({
    stream,
    staleSegmentIds,
    removeBeforeTime: time,
  }: {
    stream: Stream;
    staleSegmentIds: string[];
    removeBeforeTime?: number;
  }) {
    const playback =
      stream.type === "video" ? this.videoPlayback : this.audioPlayback;

    for (const id of staleSegmentIds) {
      const segment = stream.segments.get(id);
      stream.segments.delete(id);
      if (!segment) continue;
      playback.removeStaleSegment(segment);
    }
    if (time !== undefined && this.isDashLive) {
      this.videoPlayback.removeBeforeTime(time);
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

  destroy() {
    this.manifestUrl = undefined;
    this.streams.clear();
    this.urlStreamMap.clear();
  }

  addLoadedSegment(segmentLocalId: string) {
    const segment = this.getSegment(segmentLocalId);
    if (!segment) return;

    if (segment.type === "video") this.videoPlayback.addLoadedSegment(segment);
    else this.audioPlayback.addLoadedSegment(segment);
  }

  updatePlayheadTime(playheadTime: number) {
    this.videoPlayback.setPlayheadTime(playheadTime);
    this.audioPlayback.setPlayheadTime(playheadTime);
  }
}
