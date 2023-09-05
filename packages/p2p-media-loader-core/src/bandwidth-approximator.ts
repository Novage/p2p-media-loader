const SMOOTH_INTERVAL = 15 * 1000;
const MEASURE_INTERVAL = 60 * 1000;

type NumberWithTime = {
  readonly value: number;
  readonly timeStamp: number;
};

export class BandwidthApproximator {
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
