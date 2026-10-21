import { diagnostics } from "./diagnostics.js";

// Minimum time denominator in ms to prevent division by zero for instantaneous
// downloads (e.g., from cache), maintaining a high bandwidth estimate so the
// ABR doesn't downshift.
const MIN_TIME_DIFF_MS = 1;

/**
 * One download as the calculator measures it: from its start — the request,
 * so the wait for the response is part of it — to its last byte, on the wall
 * clock and on the loading-only clock. Returned by `startLoading`, and handed
 * back to `addBytes` and `stopLoading`.
 */
class Download {
  bytes = 0;
  stoppedAt?: number;
  stoppedAtLoading?: number;
  /** Removed by `clear()`: what its owner still reports is not out of order. */
  cleared = false;

  constructor(
    readonly startedAt: number,
    readonly startedAtLoading: number,
  ) {}
}

export type { Download as BandwidthDownload };

/**
 * Measures bandwidth over a time window from the downloads that overlap it.
 *
 * The unit is the download, not the chunk. A chunk is stamped when it
 * arrives, which says nothing about how long its bytes took: the wait for a
 * response ends with one burst, and downloads that run side by side deliver
 * their chunks interleaved. So each download spreads its bytes evenly over its
 * own time, from its start to its last byte — or to now, while it runs — and a
 * window takes the share that falls inside it. The window's time runs from its
 * start, or from the earliest download in it if that is later, to its end.
 *
 * Two clocks: the wall clock, and a loading-only clock that stands still while
 * nothing is downloading, so that idle time does not dilute the rate.
 */
export class BandwidthCalculator {
  private downloads: Download[] = [];
  private readonly loading = new Set<Download>();
  /** Wall-clock time during which nothing was downloading. */
  private idleTime = 0;
  /** When the last download stopped, while nothing is downloading. */
  private idleSince?: number;

  constructor(private readonly clearThresholdMs = 20000) {}

  /** How many downloads are under way. */
  get loadingCount() {
    return this.loading.size;
  }

  startLoading(now = performance.now()): Download {
    if (this.loading.size === 0 && this.idleSince !== undefined) {
      this.idleTime += now - this.idleSince;
      this.idleSince = undefined;
    }
    this.clearStale(now);
    const download = new Download(now, this.loadingClock(now));
    this.loading.add(download);
    this.downloads.push(download);
    return download;
  }

  /** A download stopped, or cleared since, takes no more bytes. */
  addBytes(download: Download, bytesLength: number) {
    if (!this.loading.has(download)) {
      reportOutOfOrder(download, "bytes");
      return;
    }
    download.bytes += bytesLength;
  }

  /** Does nothing for a download stopped already, or cleared since. */
  stopLoading(download: Download, now = performance.now()) {
    if (!this.loading.delete(download)) {
      reportOutOfOrder(download, "stop");
      return;
    }
    download.stoppedAt = now;
    download.stoppedAtLoading = this.loadingClock(now);
    if (this.loading.size === 0) this.idleSince = now;
  }

  /** Bits per second over the last `seconds` during which something loaded. */
  getBandwidthLoadingOnly(seconds: number, now = performance.now()) {
    const end = this.loadingClock(now);
    return this.rate(end - seconds * 1000, end, (download) => [
      download.startedAtLoading,
      download.stoppedAtLoading ?? end,
    ]);
  }

  /**
   * Bits per second over the last `seconds` of wall-clock time, idle time
   * included, and none of it before `ignoreThresholdTimestamp`.
   */
  getBandwidth(
    seconds: number,
    ignoreThresholdTimestamp = Number.NEGATIVE_INFINITY,
    now = performance.now(),
  ) {
    const start = Math.max(now - seconds * 1000, ignoreThresholdTimestamp);
    return this.rate(start, now, (download) => [
      download.startedAt,
      download.stoppedAt ?? now,
    ]);
  }

  clear() {
    for (const download of this.downloads) download.cleared = true;
    this.downloads = [];
    this.loading.clear();
    this.idleTime = 0;
    this.idleSince = undefined;
  }

  /** Stands still while nothing is downloading. */
  private loadingClock(now: number) {
    return (this.idleSince ?? now) - this.idleTime;
  }

  private rate(
    from: number,
    to: number,
    span: (download: Download) => [start: number, end: number],
  ) {
    let bytes = 0;
    let earliest = Number.POSITIVE_INFINITY;
    for (const download of this.downloads) {
      const [start, end] = span(download);
      if (end < from || start > to) continue;
      earliest = Math.min(earliest, start);
      const duration = end - start;
      if (duration <= 0) {
        bytes += download.bytes;
        continue;
      }
      const overlap = Math.min(end, to) - Math.max(start, from);
      bytes += (download.bytes * overlap) / duration;
    }
    if (bytes === 0) return 0;
    const time = Math.max(to - Math.max(from, earliest), MIN_TIME_DIFF_MS);
    return (bytes * 8000) / time;
  }

  /** Drops downloads that ended longer ago than any window reaches back. */
  private clearStale(now: number) {
    const threshold = this.loadingClock(now) - this.clearThresholdMs;
    this.downloads = this.downloads.filter(
      (download) =>
        download.stoppedAtLoading === undefined ||
        download.stoppedAtLoading > threshold,
    );
  }
}

/**
 * Bytes or a stop for a download that is not loading. Its owner lost track
 * of it: bytes go uncounted, and a download it went on to treat as stopped
 * may still be loading here — which runs the loading-only clock for ever.
 */
function reportOutOfOrder(download: Download, call: "bytes" | "stop") {
  if (download.cleared) return;
  diagnostics?.anomaly(
    `BandwidthCalculator ${call} for a download not loading`,
  );
}
