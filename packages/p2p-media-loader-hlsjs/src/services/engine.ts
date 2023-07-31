import type Hls from "hls.js";
import type { HlsConfig, Events, Fragment } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader";
import { SegmentManager } from "./segment-mananger";
import Debug from "debug";
import { Segment } from "./playlist";

export class Engine {
  private readonly segmentManager: SegmentManager;
  private debugDestroying = Debug("hls:destroying");
  private playback: Playback = new Playback();

  constructor() {
    this.segmentManager = new SegmentManager();
  }

  public getConfig(): Pick<HlsConfig, "fLoader"> {
    return {
      fLoader: this.createFragmentLoaderClass(),
    };
  }

  initHlsJsEvents(hls: Hls) {
    hls.on("hlsManifestLoaded" as Events.MANIFEST_LOADED, (event, data) => {
      this.segmentManager.processMasterManifest(data);
    });

    hls.on("hlsLevelUpdated" as Events.LEVEL_UPDATED, (event, data) => {
      this.segmentManager.updatePlaylist(data);
    });

    hls.on(
      "hlsAudioTrackLoaded" as Events.AUDIO_TRACK_LOADED,
      (event, data) => {
        this.segmentManager.updatePlaylist(data);
      }
    );

    hls.on("hlsDestroying" as Events.DESTROYING, () => {
      this.debugDestroying("Hls destroying");
      this.destroy();
    });

    hls.on("hlsManifestLoading" as Events.MANIFEST_LOADING, () => {
      this.debugDestroying("Manifest loading");
      this.destroy();
    });

    hls.on("hlsMediaAttaching" as Events.MEDIA_ATTACHING, () => {
      this.debugDestroying("Media attaching");
      this.destroy();
    });

    hls.on("hlsFragChanged" as Events.FRAG_CHANGED, (event, data) =>
      this.playback.fragChanged(data.frag)
    );

    hls.on("hlsMediaAttached" as Events.MEDIA_ATTACHED, (event, data) => {
      data.media.addEventListener("pause", () => {
        console.log("PAUSE");
        this.playback.pause();
      });

      data.media.addEventListener("waiting", () => {
        console.log("WAITING");
        this.playback.pause();
      });

      data.media.addEventListener("playing", () => {
        console.log("PLAYING");
        this.playback.play();
      });
    });
  }

  destroy() {
    this.segmentManager.destroy();
  }

  private createFragmentLoaderClass() {
    const segmentManager = this.segmentManager;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;

    return class FragmentLoader extends FragmentLoaderBase {
      constructor(config: HlsConfig) {
        super(config, segmentManager);
      }

      static getEngine() {
        return engine;
      }
    };
  }
}

class Playback {
  private lastPauseMoment?: number = 1;
  private pauseDuration = 0;
  private fragChangedMoment = 0;
  segmentId?: string;

  fragChanged(frag: Fragment) {
    const now = performance.now();
    const [start, end] = frag.byteRange;
    this.segmentId = Segment.getSegmentLocalId(frag.url, { start, end });

    this.fragChangedMoment = now;
    this.pauseDuration = 0;
    if (this.lastPauseMoment !== undefined) this.lastPauseMoment = now;
  }

  pause() {
    if (this.lastPauseMoment !== undefined) return;
    this.lastPauseMoment = performance.now();
  }

  play() {
    if (this.lastPauseMoment !== undefined) {
      const now = performance.now();
      this.pauseDuration += now - this.lastPauseMoment;
    }
    this.lastPauseMoment = undefined;
  }

  getPosition() {
    const now = performance.now();
    const pauseDuration =
      this.lastPauseMoment !== undefined
        ? now - this.lastPauseMoment + this.pauseDuration
        : this.pauseDuration;
    return Math.max(now - this.fragChangedMoment - pauseDuration, 0);
  }
}
