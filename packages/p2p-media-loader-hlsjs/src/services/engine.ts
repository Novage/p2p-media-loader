import Hls from "hls.js";
import type {
  HlsConfig,
  LoaderContext,
  LoaderConfiguration,
  LoaderCallbacks,
  LoaderStats,
  PlaylistLoaderConstructor,
  FragmentLoaderConstructor,
} from "hls.js";
import { FragmentLoader } from "./fragment-loader";

export class Engine {
  static getHlsInstance() {
    if (!Hls.isSupported()) return null;
    const hls = new Hls({
      liveSyncDurationCount: 7,
      maxBufferSize: 5,
      pLoader: PlaylistLoader as unknown as PlaylistLoaderConstructor,
      fLoader: FragmentLoader as unknown as FragmentLoaderConstructor,
    });
    return hls;
  }
}

class PlaylistLoader extends Hls.DefaultConfig.loader {
  constructor(config: HlsConfig) {
    super(config);
  }

  async load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    const { response, stats: loadingStats } = await this.loadData(context.url);
    if (response.ok) {
      const data: string = await response.text();
      const { duration, start, end } = loadingStats;
      const dataLength = data.length;
      const bandwidth = calculateBandwidth(dataLength, duration);

      const stats: LoaderStats = {
        aborted: false,
        loaded: dataLength,
        total: dataLength,
        chunkCount: 0,
        retry: 0,
        parsing: { start: 0, end: 0 },
        loading: { first: start, start, end },
        buffering: { first: 0, start: 0, end: 0 },
        bwEstimate: bandwidth,
      };

      callbacks.onSuccess(
        { url: context.url, data },
        stats,
        context,
        undefined
      );
    }
  }

  private async loadData(url: string) {
    const { result: response, stats } = await getActionDuration(() =>
      fetch(url)
    );
    return { response, stats };
  }
}

async function getActionDuration<T>(action: () => T) {
  const start = performance.now();
  const result = await action();
  const end = performance.now();
  const duration = end - start;

  return { result, stats: { start, end, duration } };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function calculateBandwidth(dataBytesLength: number, loadingDuration: number) {
  return Math.round((dataBytesLength * 8) / (loadingDuration / 1000));
}
