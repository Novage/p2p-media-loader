import { LoadProgress } from "./request";

export class BandwidthApproximator {
  private readonly loadings: LoadProgress[] = [];

  addLoading(progress: LoadProgress) {
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

const SMOOTH_INTERVAL = 15 * 1000;
const MEASURE_INTERVAL = 60 * 1000;

type NumberWithTime = {
  readonly value: number;
  readonly timeStamp: number;
};

export class BandwidthApproximator1 {
  private lastBytes: NumberWithTime[] = [];
  private currentBytesSum = 0;
  private lastBandwidth: NumberWithTime[] = [];

  addBytes(bytes: number): void {
    const timeStamp = performance.now();
    this.lastBytes.push({ value: bytes, timeStamp });
    this.currentBytesSum += bytes;

    while (timeStamp - this.lastBytes[0].timeStamp > SMOOTH_INTERVAL) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.currentBytesSum -= this.lastBytes.shift()!.value;
    }

    const interval = Math.min(SMOOTH_INTERVAL, timeStamp);
    this.lastBandwidth.push({
      value: (this.currentBytesSum * 8000) / interval,
      timeStamp,
    });
  }

  // in bits per seconds
  getBandwidth(): number {
    const timeStamp = performance.now();
    while (
      this.lastBandwidth.length !== 0 &&
      timeStamp - this.lastBandwidth[0].timeStamp > MEASURE_INTERVAL
    ) {
      this.lastBandwidth.shift();
    }

    let maxBandwidth = 0;
    for (const bandwidth of this.lastBandwidth) {
      if (bandwidth.value > maxBandwidth) {
        maxBandwidth = bandwidth.value;
      }
    }

    return maxBandwidth;
  }

  getSmoothInterval(): number {
    return SMOOTH_INTERVAL;
  }

  getMeasureInterval(): number {
    return MEASURE_INTERVAL;
  }
}
