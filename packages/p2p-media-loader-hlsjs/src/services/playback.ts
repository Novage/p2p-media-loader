import { Segment } from "./playlist";

export class Playback {
  public playheadTime = 0;
  public playheadSegment?: Segment;
  private readonly loadedSegments: Map<number, Segment> = new Map();

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
      const { index } = this.playheadSegment;
      nextSegment = this.loadedSegments.get(index);
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

  removeStaleSegment(segment: Segment) {
    this.loadedSegments.delete(segment.index);
  }
}
