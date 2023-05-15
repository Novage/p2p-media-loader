import type {
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  FragmentLoaderContext,
} from "hls.js";

import { LoaderBase, Helper, FetchError } from "./loader-base";
import type { ByteRange } from "./loader-base";

export class FragmentLoader extends LoaderBase<FragmentLoaderContext> {
  constructor(config: HlsConfig) {
    super(config);
  }

  public async loadAndReport(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    const stats = this.stats;
    const { loading } = stats;
    try {
      const requestPromise = this.fetchFragment(context.url);
      loading.start = performance.now();
      const { maxTimeToFirstByteMs, maxLoadTimeMs } = config.loadPolicy;
      const timeout =
        maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs)
          ? maxTimeToFirstByteMs
          : maxLoadTimeMs;
      this.setAbortTimeout(timeout);

      const response = (this.response = await requestPromise);
      loading.first = Math.max(performance.now(), loading.start);
      this.clearTimeout();
      this.setAbortTimeout(maxLoadTimeMs - (loading.first - loading.start));

      if (!response.ok) {
        const { status, statusText } = response;
        throw new FetchError(
          statusText || "Fetch, bad network response",
          status,
          response
        );
      }

      const fragmentData = await response.arrayBuffer();
      this.clearTimeout();
      loading.end = Math.max(self.performance.now(), stats.loading.first);

      stats.total = fragmentData.byteLength;
      if (stats.total) stats.loaded = stats.total;
      stats.parsing = { start: performance.now() - 1, end: performance.now() };
      stats.buffering = {
        start: performance.now() - 2,
        first: performance.now() - 1,
        end: performance.now(),
      };
      stats.bwEstimate = Helper.getBandwidth(
        stats.loaded,
        stats.loading.end - stats.loading.start
      );

      callbacks.onSuccess(
        { url: context.url, data: fragmentData, code: response.status },
        stats,
        context,
        response
      );
    } catch (error: unknown) {
      this.clearTimeout();
      if (stats.aborted) return;

      if (error instanceof FetchError) {
        callbacks.onError(
          { code: error.code, text: error.message },
          context,
          error ? error.details : null,
          stats
        );
      }
    }
  }

  private async fetchFragment(url: string, byteRange?: Partial<ByteRange>) {
    const headers = new Headers(new Headers({ ...this.context.headers }));
    if (
      byteRange &&
      byteRange.rangeStart !== undefined &&
      byteRange.rangeEnd !== undefined
    ) {
      headers.append(
        "Range",
        Helper.getByteRangeHeaderString(byteRange as ByteRange)
      );
    }
    const requestInit: RequestInit = {
      method: "GET",
      mode: "cors",
      credentials: "same-origin",
      signal: this.abortController?.signal,
      headers,
    };
    return fetch(url, requestInit);
  }
}
