import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { StreamInfo, StreamProtocol, Shaka, Stream } from "./types";
import { LoadingHandler } from "./loading-handler";
import { decorateMethod } from "./utils";
import { Core, CoreEventHandlers } from "p2p-media-loader-core";

export class Engine {
  private readonly shaka: Shaka;
  private readonly streamInfo: StreamInfo = {};
  private readonly core: Core<Stream>;
  private readonly segmentManager: SegmentManager;
  private debugDestroying = Debug("shaka:destroying");

  constructor(shaka?: unknown, eventHandlers?: CoreEventHandlers) {
    this.shaka = (shaka as Shaka | undefined) ?? window.shaka;
    this.core = new Core(eventHandlers);
    this.segmentManager = new SegmentManager(this.streamInfo, this.core);
  }

  initShakaPlayer(player: shaka.Player) {
    this.initializeNetworkingEngine();
    this.registerParsers();

    player.addEventListener("loading", () => {
      this.debugDestroying("Loading manifest");
      this.destroy();
    });
    decorateMethod(player, "destroy", () => {
      this.debugDestroying("Shaka player destroying");
      this.destroy();
    });

    player.addEventListener("loaded", () => {
      const media = player.getMediaElement();
      if (!media) return;

      media.addEventListener("timeupdate", () => {
        this.core.updatePlayback(media.currentTime, media.playbackRate);
      });

      media.addEventListener("ratechange", () => {
        this.core.updatePlayback(media.currentTime, media.playbackRate);
      });

      media.addEventListener("seeking", () => {
        this.core.updatePlayback(media.currentTime, media.playbackRate);
      });
    });
  }

  destroy() {
    this.streamInfo.protocol = undefined;
    this.streamInfo.manifestResponseUrl = undefined;
    this.core.destroy();
  }

  private registerParsers() {
    const setProtocol = (protocol: StreamProtocol) => {
      this.streamInfo.protocol = protocol;
    };
    const hlsParserFactory = () =>
      new HlsManifestParser(this.shaka, this.segmentManager, setProtocol);
    const dashParserFactory = () =>
      new DashManifestParser(this.shaka, this.segmentManager, setProtocol);
    this.shaka.media.ManifestParser.registerParserByExtension(
      "mpd",
      dashParserFactory
    );
    this.shaka.media.ManifestParser.registerParserByMime(
      "application/dash+xml",
      dashParserFactory
    );
    this.shaka.media.ManifestParser.registerParserByExtension(
      "m3u8",
      hlsParserFactory
    );
    this.shaka.media.ManifestParser.registerParserByMime(
      "application/x-mpegurl",
      hlsParserFactory
    );
    this.shaka.media.ManifestParser.registerParserByMime(
      "application/vnd.apple.mpegurl",
      hlsParserFactory
    );
  }

  private initializeNetworkingEngine() {
    const handleLoading: shaka.extern.SchemePlugin = (...args) => {
      const loadingHandler = new LoadingHandler({
        shaka: this.shaka,
        streamInfo: this.streamInfo,
        segmentManager: this.segmentManager,
        core: this.core,
      });
      return loadingHandler.handleLoading(...args);
    };
    this.shaka.net.NetworkingEngine.registerScheme("http", handleLoading);
    this.shaka.net.NetworkingEngine.registerScheme("https", handleLoading);
  }
}
