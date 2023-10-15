import { LoadProgress } from "./request";

export class BandwidthApproximator {
  private readonly loadings: LoadProgress[] = [];

  addLoading(progress: LoadProgress) {
    this.loadings.push(progress);
  }

  getBandwidth() {
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
  let currentRange: { from: number; to: number } | undefined;
  let totalLoadingTime = 0;
  let totalBytes = 0;
  const now = performance.now();

  for (let {
    // eslint-disable-next-line prefer-const
    startTimestamp: from,
    lastLoadedChunkTimestamp: to,
    // eslint-disable-next-line prefer-const
    loadedBytes,
  } of loadings) {
    totalBytes += loadedBytes;
    if (to === undefined) to = now;

    if (!currentRange || from > currentRange.to) {
      currentRange = { from, to };
      totalLoadingTime += to - from;
      continue;
    }

    if (from <= currentRange.to && to > currentRange.to) {
      totalLoadingTime += to - currentRange.to;
      currentRange.to = to;
    }
  }

  return (totalBytes * 8000) / totalLoadingTime;
}
