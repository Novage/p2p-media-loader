import type {
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  PlaylistLoaderContext,
} from "hls.js";
import { LoaderBase, Helper, FetchError } from "./loader-base";

export class PlaylistLoader extends LoaderBase<PlaylistLoaderContext> {
  constructor(config: HlsConfig) {
    super(config);
  }

  protected async loadInternal(
    context: PlaylistLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    const stats = this.stats;
    const { loading } = stats;
    try {
      const requestPromise = this.fetchPlaylist(context.url);
      loading.start = performance.now();
      const { maxTimeToFirstByteMs, maxLoadTimeMs } = config.loadPolicy;
      const timeout =
        maxTimeToFirstByteMs && Number.isFinite(maxTimeToFirstByteMs)
          ? maxTimeToFirstByteMs
          : maxLoadTimeMs;
      this.setAbortTimeout(timeout);

      this.response = await requestPromise;
      loading.first = Math.max(performance.now(), loading.start);
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

      const playlist = await this.response.text();
      this.segmentManager.parsePlaylist(playlist);
      this.clearTimeout();
      loading.end = Math.max(self.performance.now(), stats.loading.first);

      stats.loaded = playlist.length;
      stats.total = playlist.length;
      stats.bwEstimate = Helper.getBandwidth(
        stats.loaded,
        stats.loading.end - stats.loading.start
      );

      callbacks.onSuccess(
        { url: this.response.url, data: playlist, code: this.response.status },
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

  private async fetchPlaylist(url: string) {
    const { headers } = this.context;
    return fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "same-origin",
      signal: this.abortController.signal,
      headers: new Headers({ ...headers }),
    });
  }
}
