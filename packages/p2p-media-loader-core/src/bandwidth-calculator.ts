import { arrayBackwards } from "./utils/utils";

type Interval = { start: number; end?: number };

const CLEAR_THRESHOLD_MS = 3000;

export class BandwidthCalculator {
  private simultaneousLoadingsCount = 0;
  private readonly bytes: number[] = [];
  private readonly timestamps: number[] = [];
  private loadingIntervals: Interval[] = [];

  addBytes(bytesLength: number) {
    this.bytes.push(bytesLength);
    this.timestamps.push(performance.now());
  }

  startLoading() {
    this.clearStale();
    if (this.simultaneousLoadingsCount === 0) {
      this.loadingIntervals.push({ start: performance.now() });
    }
    this.simultaneousLoadingsCount++;
  }

  stopLoading() {
    this.clearStale();
    if (this.simultaneousLoadingsCount <= 0) return;
    this.simultaneousLoadingsCount--;
    if (this.simultaneousLoadingsCount !== 0) return;
    this.loadingIntervals[this.loadingIntervals.length - 1].end =
      performance.now();
  }

  // in bits per second
  getBandwidthForLastNSeconds(seconds: number) {
    const { bytes, timestamps } = this;
    if (!bytes.length) return 0;
    const milliseconds = seconds * 1000;
    const now = performance.now();
    let totalTime = 0;

    let firstIntervalStart = Number.POSITIVE_INFINITY;
    for (const { start, end = now } of arrayBackwards(this.loadingIntervals)) {
      const duration = end - start;
      if (totalTime + duration < milliseconds) {
        totalTime += duration;
        firstIntervalStart = start;
        continue;
      }
      firstIntervalStart = end - (milliseconds - totalTime);
      totalTime = milliseconds;
      break;
    }
    if (totalTime === 0) return 0;

    let totalBytes = 0;
    for (let i = bytes.length - 1; i >= 0; i--) {
      if (timestamps[i] < firstIntervalStart) break;
      totalBytes += bytes[i];
    }

    return (totalBytes * 8000) / totalTime;
  }

  clearStale() {
    if (!this.loadingIntervals.length) return;
    const now = performance.now();
    let totalTime = 0;

    let intervalsToLeave = 0;
    for (const { start, end = now } of arrayBackwards(this.loadingIntervals)) {
      const duration = end - start;
      intervalsToLeave++;
      if (totalTime + duration >= CLEAR_THRESHOLD_MS) break;
      totalTime += duration;
    }
    const intervalsToRemove = this.loadingIntervals.length - intervalsToLeave;
    this.loadingIntervals.splice(0, intervalsToRemove);

    const { start: firstIntervalStart } = this.loadingIntervals[0];
    let samplesToRemove = 0;
    for (const timestamp of this.timestamps) {
      if (timestamp >= firstIntervalStart) break;
      samplesToRemove++;
    }
    this.bytes.splice(0, samplesToRemove);
    this.timestamps.splice(0, samplesToRemove);
  }
}
