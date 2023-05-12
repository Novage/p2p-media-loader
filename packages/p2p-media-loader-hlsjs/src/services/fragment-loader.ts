import Hls, { LoadStats } from "hls.js";
import {} from "hls.js/src/controller/base-stream-controller";
import type {
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  Fragment,
  PlaylistContextType,
} from "hls.js";

interface LoaderContextCustom extends LoaderContext {
  type?: PlaylistContextType;
  frag?: Fragment;
}

interface ByteRange {
  rangeStart: number;
  rangeEnd: number;
}

// export class FragmentLoader extends Hls.DefaultConfig.loader {
export class FragmentLoader {
  context!: LoaderContext;
  config!: LoaderConfiguration;
  callbacks!: LoaderCallbacks<LoaderContext>;
  abortController: AbortController | undefined;
  requestTimeout?: number;
  stats: LoadStats;

  constructor(config: HlsConfig) {
    // super(config);
    // this.abortController = new AbortController();
    this.stats = {
      buffering: { start: 0, end: 0, first: 0 },
      parsing: { start: 0, end: 0 },
      aborted: false,
      bwEstimate: 0,
      chunkCount: 0,
      loaded: 0,
      loading: { start: 0, end: 0, first: 0 },
      retry: 0,
      total: 0,
    };
  }

  async load(
    context: LoaderContextCustom,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;

    const stats = this.stats;
    try {
      const { maxTimeToFirstByteMs, maxLoadTimeMs } = this.config.loadPolicy;
      const timeout =
        maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs)
          ? maxTimeToFirstByteMs
          : maxLoadTimeMs;
      this.setAbortTimeout(timeout);
      stats.loading.start = performance.now();

      const { rangeStart, rangeEnd } = context;
      const response = await this.fetchFragment(context.url, {
        rangeStart,
        rangeEnd,
      });

      this.clearTimeout();
      stats.loading.first = Math.max(performance.now(), stats.loading.start);
      this.setAbortTimeout(
        maxLoadTimeMs - (stats.loading.first - stats.loading.start)
      );

      if (!response.ok) {
        const { status, statusText } = response;
        throw new FetchError(
          statusText || "Fetch, bad network response",
          status,
          response
        );
      }

      stats.total = getContentLength(response.headers) || stats.total;
      const data = await response.arrayBuffer();
      this.clearTimeout();
      stats.loading.end = Math.max(self.performance.now(), stats.loading.first);
      stats.total = data.byteLength;

      if (stats.total) stats.loaded = stats.total;

      stats.parsing = { start: performance.now() - 1, end: performance.now() };
      stats.buffering = {
        start: performance.now() - 2,
        first: performance.now() - 1,
        end: performance.now(),
      };
      stats.chunkCount = 1;

      const bandwidth =
        (stats.loaded * 8) / (stats.loading.end - stats.loading.start);
      stats.bwEstimate = bandwidth;

      console.log(JSON.stringify(stats));

      callbacks.onSuccess({ url: context.url, data }, stats, context, response);
    } catch (err: unknown) {
      this.clearTimeout();
      if (stats.aborted) return;
    }
  }

  private setAbortTimeout(timeout: number) {
    this.clearTimeout();
    this.requestTimeout = setTimeout(() => {
      this.abort();
      this.callbacks.onTimeout(this.stats, this.context, undefined);
    }, timeout);
  }

  private clearTimeout() {
    clearTimeout(this.requestTimeout);
  }

  // abortInternal(): void {
  //   const response = this.response;
  //   if (!response?.ok) {
  //     this.stats.aborted = true;
  //     this.abortController.abort();
  //   }
  // }

  abort() {
    this.stats.aborted = true;
    this.abortController?.abort();
  }

  destroy() {
    if (!this.stats.aborted) {
      // this.abort();
      console.log("DESTROY AND CLEAN UP");
    }
  }

  private async fetchFragment(url: string, byteRange?: Partial<ByteRange>) {
    const headers = new Headers();
    if (
      byteRange &&
      byteRange.rangeStart !== undefined &&
      byteRange.rangeEnd !== undefined
    ) {
      headers.append("Range", getByteRangeHeaderString(byteRange as ByteRange));
    }
    const requestInit: RequestInit = {
      signal: this.abortController?.signal,
      headers,
    };
    return fetch(url, requestInit);
  }
}

function getByteRangeHeaderString(byteRange: ByteRange) {
  const { rangeStart, rangeEnd } = byteRange;
  return `bytes=${rangeStart}-${rangeEnd - 1}`;
}

class FetchError extends Error {
  public code: number;
  public details: any;

  constructor(message: string, code: number, details: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function getContentLength(headers: Headers): number | undefined {
  const contentRange = headers.get("Content-Range");
  if (contentRange) {
    const byteRangeLength = getByteRangeLength(contentRange);
    if (Number.isFinite(byteRangeLength)) {
      return byteRangeLength;
    }
  }
  const contentLength = headers.get("Content-Length");
  if (contentLength) {
    return parseInt(contentLength);
  }
}

const BYTERANGE = /(\d+)-(\d+)\/(\d+)/;

function getByteRangeLength(byteRangeHeader: string): number | undefined {
  const result = BYTERANGE.exec(byteRangeHeader);
  if (result) {
    return parseInt(result[2]) - parseInt(result[1]) + 1;
  }
}
