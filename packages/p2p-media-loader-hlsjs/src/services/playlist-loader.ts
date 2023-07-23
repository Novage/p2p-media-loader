import type {
  Loader,
  LoaderConfiguration,
  PlaylistLoaderContext,
  LoaderCallbacks,
  HlsConfig,
  LoaderStats,
  LoaderContext,
} from "hls.js";
import { SegmentManager } from "./segment-mananger";

export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  context!: PlaylistLoaderContext;
  config!: LoaderConfiguration;
  callbacks!: LoaderCallbacks<PlaylistLoaderContext>;
  stats: LoaderStats;
  defaultLoader: Loader<LoaderContext>;
  segmentManager: SegmentManager;
  onPlaylistLoaded: (playlistUrl: string) => void;

  constructor(
    config: HlsConfig,
    segmentManager: SegmentManager,
    onPlaylistLoaded: (playlistUrl: string) => void
  ) {
    this.defaultLoader = new config.loader(config);
    this.stats = this.defaultLoader.stats;
    this.segmentManager = segmentManager;
    this.onPlaylistLoaded = onPlaylistLoaded;
  }

  load(
    context: PlaylistLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;

    const playlist = this.segmentManager.playlists.get(context.url);
    console.log("\nPLAYLIST");
    console.log(context.url);
    // if (playlist?.type === "audio") {
    // }
    this.defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess: (response, stats, context, networkDetails) => {
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

  getCacheAge() {
    return this.defaultLoader.getCacheAge?.() ?? null;
  }

  getResponseHeader(name: string) {
    return this.defaultLoader.getResponseHeader?.(name) ?? null;
  }
}

function getProxy<T extends object, P extends keyof T>(
  target: T,
  property: P,
  handler: () => void
) {
  return new Proxy(target, {
    set(target, prop, value) {
      if (
        prop === property &&
        // target[prop as keyof typeof target] === 0 &&
        value !== 0
      ) {
        // console.log(value);
        handler();
      }
      return Reflect.set(target, property, value);
    },
  });
}
