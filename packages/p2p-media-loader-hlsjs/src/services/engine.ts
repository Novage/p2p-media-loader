import type Hls from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { FragmentLoader } from "./fragment-loader";
import { PlaylistLoader } from "./playlist-loader";
import type { Writable } from "type-fest";
import { LoaderBase } from "./loader-base";
import type { ByteRange } from "./loader-base";
import { SegmentManager } from "./segment-manager";

export class Engine {
  private readonly segmentManager: SegmentManager;
  private readonly pLoader: typeof PlaylistLoader;
  private readonly fLoader: typeof FragmentLoader;
  private hls?: Hls;

  constructor() {
    this.segmentManager = new SegmentManager();
    this.pLoader = getLoaderClass(PlaylistLoader, this.segmentManager);
    this.fLoader = getLoaderClass(FragmentLoader, this.segmentManager);
  }

  initHlsJsPlayer(hls: Hls) {
    this.hls = hls;
    hls.config.pLoader = this.pLoader;
    hls.config.fLoader = this.fLoader;
    hls.config.maxBufferSize = 5;

    this.hls.on(
      "hlsManifestParsed" as Events.MANIFEST_PARSED,
      (event, data) => {
        console.log(data.levels.map((i) => i.bitrate));
      }
    );
    this.hls.on("hlsLevelSwitched" as Events.LEVEL_SWITCHED, (event, data) => {
      console.log(data);
    });
  }

  initClapprPlayer(player: any) {
    player.on("play", () => {
      const playback = player.core.getCurrentPlayback();
      if (playback._hls && !playback._hls._p2pm_linitialized) {
        playback._hls._p2pm_linitialized = true;
        this.hls = player.core.getCurrentPlayback()._hls;
        this.initHlsJsEvents();
      }
    });
  }

  getLoaders(): Pick<HlsConfig, "fLoader" | "pLoader"> {
    return { pLoader: this.pLoader, fLoader: this.fLoader };
  }

  private destroy() {
    //do something with segment manager;
  }

  private setPlayingSegment(
    url: string,
    byteRange: ByteRange | undefined,
    start: number,
    duration: number
  ): void {
    //do something with segment manager;
  }

  private setPlayingSegmentByCurrentTime(playheadPosition: number): void {
    //do something with segment manager;
  }

  initHlsJsEvents() {
    const { hls } = this;
    if (!hls) return;

    hls.on("hlsFragChanged" as Events.FRAG_CHANGED, (event, data) => {
      const frag = data.frag;
      const byteRange: ByteRange | undefined =
        frag.byteRange.length !== 2
          ? undefined
          : {
              rangeStart: frag.byteRange[0],
              rangeEnd: frag.byteRange[1] - frag.byteRange[0],
            };
      this.setPlayingSegment(frag.url, byteRange, frag.start, frag.duration);
    });

    hls.on("hlsDestroying" as Events.DESTROYING, async () => {
      await this.destroy();
    });

    hls.on("hlsError" as Events.ERROR, (event, errorData) => {
      if (errorData.details === "bufferStalledError") {
        const htmlMediaElement = !hls.media
          ? ((hls as any).el_ as HTMLMediaElement | undefined) // videojs-contrib-hlsjs
          : hls.media; // all others

        if (htmlMediaElement) {
          this.setPlayingSegmentByCurrentTime(htmlMediaElement.currentTime);
        }
      }
    });
  }
}

function getLoaderClass<
  T extends typeof PlaylistLoader | typeof FragmentLoader
>(LoaderClass: T, segmentManager: SegmentManager): T {
  const loaderClass = LoaderClass.prototype as Writable<LoaderBase>;
  loaderClass.segmentManager = segmentManager;
  return LoaderClass;
}
