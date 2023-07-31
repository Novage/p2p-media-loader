import { Segment } from "./segment";

export class Playback {
  public playheadTime = 0;
  public playheadSegment?: Segment;
  private readonly loadedSegmentsMap: Map<number, Segment> = new Map();
  private readonly isDashLive: boolean;

  constructor(isDashLive: boolean) {
    this.isDashLive = isDashLive;
  }

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

    let nextSegment: Segment | undefined;
    if (this.playheadSegment) {
      if (this.isDashLive) {
        const { endTime } = this.playheadSegment;
        nextSegment = this.loadedSegmentsMap.get(endTime);
      } else {
        const { index } = this.playheadSegment;
        nextSegment = this.loadedSegmentsMap.get(index);
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

    const loadedSegments = [...this.loadedSegmentsMap.values()];

    // binary search
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

  removeSegmentsBeforeTime(time: number) {
    if (!this.isDashLive) return;
    // in the case of dash+live key is startTime
    for (const startTime of this.loadedSegmentsMap.keys()) {
      if (startTime < time) this.loadedSegmentsMap.delete(startTime);
    }
  }

  removeStaleSegment(segment: Segment) {
    this.loadedSegmentsMap.delete(segment.index);
  }
}
