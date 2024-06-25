export class BandwidthCalculator {
  private loadingsCount = 0;
  private readonly bytes: number[] = [];
  private readonly loadingOnlyTimestamps: number[] = [];
  private readonly timestamps: number[] = [];
  private noLoadingsTime = 0;
  private loadingsStoppedAt = 0;

  constructor(private readonly clearThresholdMs = 20000) {}

  addBytes(bytesLength: number, now = performance.now()) {
    this.bytes.push(bytesLength);
    this.loadingOnlyTimestamps.push(now - this.noLoadingsTime);
    this.timestamps.push(now);
  }

  startLoading(now = performance.now()) {
    this.clearStale();
    if (this.loadingsCount === 0 && this.loadingsStoppedAt !== 0) {
      this.noLoadingsTime += now - this.loadingsStoppedAt;
    }
    this.loadingsCount++;
  }

  stopLoading(now = performance.now()) {
    if (this.loadingsCount > 0) {
      this.loadingsCount--;
      if (this.loadingsCount === 0) this.loadingsStoppedAt = now;
    }
  }

  getBandwidthLoadingOnly(
    seconds: number,
    ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY,
  ) {
    if (!this.loadingOnlyTimestamps.length) return 0;
    const milliseconds = seconds * 1000;
    const lastItemTimestamp =
      this.loadingOnlyTimestamps[this.loadingOnlyTimestamps.length - 1];
    let lastCountedTimestamp = lastItemTimestamp;
    const threshold = lastItemTimestamp - milliseconds;
    let totalBytes = 0;

    for (let i = this.bytes.length - 1; i >= 0; i--) {
      const timestamp = this.loadingOnlyTimestamps[i];
      if (
        timestamp < threshold ||
        this.timestamps[i] < ignoreThresholdTimestamp
      ) {
        break;
      }
      lastCountedTimestamp = timestamp;
      totalBytes += this.bytes[i];
    }

    return (totalBytes * 8000) / (lastItemTimestamp - lastCountedTimestamp);
  }

  getBandwidth(
    seconds: number,
    ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY,
    now = performance.now(),
  ) {
    if (!this.timestamps.length) return 0;
    const milliseconds = seconds * 1000;
    const threshold = now - milliseconds;
    let lastCountedTimestamp = now;
    let totalBytes = 0;

    for (let i = this.bytes.length - 1; i >= 0; i--) {
      const timestamp = this.timestamps[i];
      if (timestamp < threshold || timestamp < ignoreThresholdTimestamp) break;
      lastCountedTimestamp = timestamp;
      totalBytes += this.bytes[i];
    }

    return (totalBytes * 8000) / (now - lastCountedTimestamp);
  }

  clearStale() {
    if (!this.loadingOnlyTimestamps.length) return;
    const threshold =
      this.loadingOnlyTimestamps[this.loadingOnlyTimestamps.length - 1] -
      this.clearThresholdMs;

    let samplesToRemove = 0;
    for (const timestamp of this.loadingOnlyTimestamps) {
      if (timestamp > threshold) break;
      samplesToRemove++;
    }

    this.bytes.splice(0, samplesToRemove);
    this.loadingOnlyTimestamps.splice(0, samplesToRemove);
    this.timestamps.splice(0, samplesToRemove);
  }
}
