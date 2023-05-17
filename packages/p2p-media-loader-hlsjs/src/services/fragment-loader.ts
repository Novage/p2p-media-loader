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

  protected async loadInternal(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    const stats = this.stats;
    const { loading } = stats;
    try {
      const { rangeStart, rangeEnd } = context;
      const requestPromise = this.fetchFragment(context.url, {
        rangeStart,
        rangeEnd,
      });
      loading.start = performance.now();
      const { maxTimeToFirstByteMs, maxLoadTimeMs } = config.loadPolicy;
      const timeout =
        maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs)
          ? maxTimeToFirstByteMs
          : maxLoadTimeMs;
      this.setAbortTimeout(timeout);

      this.response = await requestPromise;
      loading.first = Math.round(Math.max(performance.now(), loading.start));
      this.clearTimeout();
      this.setAbortTimeout(maxLoadTimeMs - (loading.first - loading.start));

      if (!this.response.ok) {
        const { status, statusText } = this.response;
        throw new FetchError(
          statusText || "Fetch, bad network response",
          status,
          this.response
        );
      }

      const fragmentData = await this.response.arrayBuffer();
      this.clearTimeout();
      loading.end = Math.round(
        Math.max(performance.now(), stats.loading.first)
      );

      stats.total = fragmentData.byteLength;
      stats.loaded = fragmentData.byteLength;

      if (this.segmentManager.masterManifest) {
        const bitrate = this.segmentManager.masterManifest.getBitrateOfLevel(2);
        const { loadingStart, bandwidth } =
          Helper.getLoadingStartBasedOnBitrate(
            bitrate,
            loading.first,
            fragmentData.byteLength
          );
        loading.start = loadingStart;
        stats.bwEstimate = bandwidth;
      } else {
        stats.bwEstimate = Helper.getBandwidth(
          stats.total,
          loading.first - loading.start
        );
      }

      callbacks.onSuccess(
        {
          url: this.response.url,
          data: fragmentData,
          code: this.response.status,
        },
        stats,
        context,
        this.response
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
