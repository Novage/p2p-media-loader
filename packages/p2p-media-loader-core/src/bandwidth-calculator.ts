import { arrayBackwards } from "./utils/utils";

export class BandwidthCalculator {
  private simultaneousLoadingsCount = 0;
  private readonly bytes: number[] = [];
  private readonly timestamps: number[] = [];
  private loadingIntervals: { start: number; end?: number }[] = [];

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
    this.clearStale();
    const { bytes, timestamps, loadingIntervals } = this;
    const samplesLength = bytes.length;
    const now = performance.now();
    const threshold = now - seconds * 1000;

    let loadedBytes = 0;
    for (let i = samplesLength - 1; i >= 0; i--) {
      if (timestamps[i] < threshold) break;
      loadedBytes += bytes[i];
    }

    let clearLoadingTime = 0;
    for (const { start, end } of arrayBackwards(loadingIntervals)) {
      if (start < threshold && end !== undefined && end < threshold) break;
      const from = Math.max(start, threshold);
      const to = end ?? now;
      clearLoadingTime += to - from;
    }

    if (clearLoadingTime === 0) return 0;
    return (loadedBytes * 8000) / clearLoadingTime;
  }

  private clearStale() {
    const { timestamps, bytes, loadingIntervals } = this;
    const samplesLength = bytes.length;
    const threshold = performance.now() - 15000;

    let count = 0;
    while (count < samplesLength && timestamps[count] < threshold) count++;
    bytes.splice(0, count);
    timestamps.splice(0, count);

    count = 0;
    for (const { start, end } of loadingIntervals) {
      if (!(start < threshold && end !== undefined && end <= threshold)) break;
      count++;
    }
    loadingIntervals.splice(0, count);
  }
}
