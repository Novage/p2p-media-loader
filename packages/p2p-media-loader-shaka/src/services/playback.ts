import { Segment } from "./segment";

export class Playback {
  public playheadTime = 0;
  public playheadSegment?: Segment;
  private readonly loadedSegments: Map<number, Segment> = new Map();
  private readonly isDashLive: boolean;

  constructor(isDashLive: boolean) {
    this.isDashLive = isDashLive;
  }

  setPlayheadTime(playheadTime: number) {
    this.playheadTime = playheadTime;
    if (!this.loadedSegments.size) return;

    if (
      this.playheadSegment &&
      playheadTime >= this.playheadSegment.startTime &&
      playheadTime < this.playheadSegment.endTime
    ) {
      return;
    }

    let nextSegment: Segment | undefined;
    if (this.playheadSegment) {
      if (this.isDashLive) {
        const { endTime } = this.playheadSegment;
        nextSegment = this.loadedSegments.get(endTime);
      } else {
        const { index } = this.playheadSegment;
        nextSegment = this.loadedSegments.get(index);
      }
    }

    if (
      nextSegment &&
      playheadTime >= nextSegment.startTime &&
      playheadTime < nextSegment.endTime
    ) {
      this.playheadSegment = nextSegment;
      return;
    }

    const loadedSegments = [...this.loadedSegments.values()];

    const segment = loadedSegments.find(
      (s) => playheadTime >= s.startTime && playheadTime < s.endTime
    );
    if (segment) this.playheadSegment = segment;
  }

  addLoadedSegment(segment: Segment) {
    this.loadedSegments.set(segment.index, segment);
  }

  removeSegmentsBeforeTime(time: number) {
    if (!this.isDashLive) return;
    // in the case of dash+live key is startTime
    for (const startTime of this.loadedSegments.keys()) {
      if (startTime < time) this.loadedSegments.delete(startTime);
    }
  }

  removeStaleSegment(segment: Segment) {
    this.loadedSegments.delete(segment.index);
  }
}
