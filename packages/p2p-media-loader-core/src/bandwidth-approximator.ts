import { LoadProgress } from "./request-container";

export class BandwidthApproximator {
  private readonly loadings: LoadProgress[] = [];

  addLoading(progress: LoadProgress) {
    this.clearStale();
    this.loadings.push(progress);
  }

  // in bits per second
  getBandwidth(): number {
    this.clearStale();
    return getBandwidthByProgressList(this.loadings);
  }

  private clearStale() {
    const now = performance.now();
    for (const { startTimestamp } of this.loadings) {
      if (now - startTimestamp <= 15000) break;
      this.loadings.shift();
    }
  }
}

function getBandwidthByProgressList(loadings: LoadProgress[]) {
  if (!loadings.length) return 0;
  let margin: number | undefined;
  let totalLoadingTime = 0;
  let totalBytes = 0;
  const now = performance.now();

  for (const {
    startTimestamp: from,
    lastLoadedChunkTimestamp: to = now,
    loadedBytes,
  } of loadings) {
    totalBytes += loadedBytes;

    if (margin === undefined || from > margin) {
      margin = to;
      totalLoadingTime += to - from;
      continue;
    }

    if (from <= margin && to > margin) {
      totalLoadingTime += to - margin;
      margin = to;
    }
  }

  return (totalBytes * 8000) / totalLoadingTime;
}
