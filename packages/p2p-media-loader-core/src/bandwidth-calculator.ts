const CLEAR_THRESHOLD_MS = 3000;

export class BandwidthCalculator {
  private simultaneousLoadingsCount = 0;
  private readonly bytes: number[] = [];
  private readonly timestamps: number[] = [];
  private noLoadingsTotalTime = 0;
  private allLoadingsStoppedTimestamp = 0;

  addBytes(bytesLength: number, now = performance.now()) {
    this.bytes.push(bytesLength);
    this.timestamps.push(now - this.noLoadingsTotalTime);
  }

  startLoading(now = performance.now()) {
    this.clearStale();
    if (this.simultaneousLoadingsCount === 0) {
      this.noLoadingsTotalTime += now - this.allLoadingsStoppedTimestamp;
    }
    this.simultaneousLoadingsCount++;
  }

  // in bits per second
  stopLoading(now = performance.now()) {
    if (this.simultaneousLoadingsCount <= 0) return;
    this.simultaneousLoadingsCount--;
    if (this.simultaneousLoadingsCount !== 0) return;
    this.allLoadingsStoppedTimestamp = now;
  }

  getBandwidthForLastNSeconds(seconds: number) {
    if (!this.timestamps.length) return 0;
    const milliseconds = seconds * 1000;
    const lastItemTimestamp = this.timestamps[this.timestamps.length - 1];
    let lastCountedTimestamp = lastItemTimestamp;
    const threshold = lastItemTimestamp - milliseconds;
    let totalBytes = 0;

    for (let i = this.bytes.length - 1; i >= 0; i--) {
      const timestamp = this.timestamps[i];
      if (timestamp < threshold) break;
      lastCountedTimestamp = timestamp;
      totalBytes += this.bytes[i];
    }

    return (totalBytes * 8000) / (lastItemTimestamp - lastCountedTimestamp);
  }

  clearStale() {
    if (!this.timestamps.length) return;
    const threshold =
      this.timestamps[this.timestamps.length - 1] - CLEAR_THRESHOLD_MS;

    let samplesToRemove = 0;
    for (const timestamp of this.timestamps) {
      if (timestamp > threshold) break;
      samplesToRemove++;
    }

    this.bytes.splice(0, samplesToRemove);
    this.timestamps.splice(0, samplesToRemove);
  }
}
