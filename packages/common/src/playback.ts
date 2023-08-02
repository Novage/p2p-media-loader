type Segment = {
  startTime: number;
  endTime: number;
  index: number;
};

export class Playback<T extends Segment = Segment> {
  public playheadTime = 0;
  public playheadSegment?: T;
  private readonly loadedSegments: Map<number, T> = new Map();
  private readonly isDashLive: boolean;

  constructor(isDashLive = false) {
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

    let nextSegment: T | undefined;
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

  addLoadedSegment(segment: T) {
    const key = this.isDashLive ? segment.startTime : segment.index;

    const hasKey = this.loadedSegments.has(key);
    this.loadedSegments.set(key, segment);
    if (this.isDashLive && !hasKey) {
      const segments = [...this.loadedSegments];
      const [overlappingSegmentKey] =
        segments.find(([, s]) => isOverlappingSegment(segment, s)) ?? [];
      if (overlappingSegmentKey) {
        this.loadedSegments.delete(overlappingSegmentKey);
      }
    }
  }

  removeBeforeTime(time: number) {
    const segments = [...this.loadedSegments];
    for (const [key, segment] of segments) {
      if (segment.startTime < time) {
        this.loadedSegments.delete(key);
      }
    }
  }

  removeStaleSegment(segment: T) {
    this.loadedSegments.delete(segment.index);
  }
}

function isOverlappingSegment(s1: Segment, s2: Segment): boolean {
  const { startTime: s1ST, endTime: s1ET } = s1;
  const { startTime: s2ST, endTime: s2ET } = s2;

  if (s1ET <= s2ST || s1ST >= s2ET) return false;
  const duration = s1ET - s1ST;
  if (s1ST >= s2ST && s1ST < s2ET) {
    const overlappingPart = s2ET - s1ST;
    const rate = overlappingPart / duration;
    return rate > 0.8;
  }
  if (s2ST >= s1ST && s2ST < s1ET) {
    const overlappingPart = s1ET - s2ST;
    const rate = overlappingPart / duration;
    return rate > 0.8;
  }

  return false;
}
