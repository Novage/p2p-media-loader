import Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import { FragmentLoader } from "./fragment-loader";
import { PlaylistLoader } from "./playlist-loader";
import type { Writable } from "type-fest";
import { LoaderBase } from "./loader-base";

export type SegmentManager = object;

export class Engine {
  private readonly segmentManager: SegmentManager;
  private readonly pLoader: typeof PlaylistLoader;
  private readonly fLoader: typeof FragmentLoader;

  constructor() {
    this.segmentManager = { isSegmentManager: true };
    this.pLoader = getLoaderClass(PlaylistLoader, this.segmentManager);
    this.fLoader = getLoaderClass(FragmentLoader, this.segmentManager);
  }

  createHlsInstance() {
    if (!Hls.isSupported()) return null;
    return new Hls({
      liveSyncDurationCount: 7,
      maxBufferSize: 5,
      pLoader: this.pLoader,
      fLoader: this.fLoader,
    });
  }

  getLoaders(): Pick<HlsConfig, "fLoader" | "pLoader"> {
    return { pLoader: this.pLoader, fLoader: this.fLoader };
  }
}

function getLoaderClass<
  T extends typeof PlaylistLoader | typeof FragmentLoader
>(LoaderClass: T, segmentManager: object): T {
  (LoaderClass.prototype as Writable<LoaderBase>).segmentManager =
    segmentManager;
  return LoaderClass;
}
