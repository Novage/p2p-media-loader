import {
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
  FragmentLoaderContext,
  HlsConfig,
  LoaderContext,
} from "hls.js";
import { SegmentManager } from "./segment-mananger";

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  defaultLoader: Loader<LoaderContext>;
  segmentManager: SegmentManager;

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.segmentManager = segmentManager;
    this.defaultLoader = new config.loader(config);
    this.stats = this.defaultLoader.stats;
  }

  async load(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess: (response, stats, context, networkDetails) => {
        // console.log("fragment: ", response.url);
        const playlist =
          this.segmentManager.videoPlaylists?.getPlaylistBySegmentUrl(
            response.url
          ) ??
          this.segmentManager.audioPlaylists?.getPlaylistBySegmentUrl(
            response.url
          );
        // console.log(playlist);

        return callbacks.onSuccess(response, stats, context, networkDetails);
      },
    });
  }

  abort() {
    this.defaultLoader.abort();
  }

  destroy() {
    this.defaultLoader.destroy();
  }
}
