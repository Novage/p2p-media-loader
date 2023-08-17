import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { StreamInfo, StreamProtocol, Shaka, Stream } from "../types/types";
import { LoadingHandler } from "./loading-handler";
import { decorateMethod } from "./utils";
import { Core } from "p2p-media-loader-core";

export class Engine {
  private readonly shaka: Shaka;
  private player!: shaka.Player;
  private readonly streamInfo: StreamInfo = {};
  private readonly core = new Core<Stream>();
  private readonly segmentManager = new SegmentManager(
    this.streamInfo,
    this.core
  );
  private debugDestroying = Debug("shaka:destroying");

  constructor(shaka?: unknown) {
    this.shaka = (shaka as Shaka | undefined) ?? window.shaka;
  }

  initShakaPlayer(player: shaka.Player) {
    this.player = player;
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
      const mediaElement = player.getMediaElement();
      if (!mediaElement) return;

      mediaElement.addEventListener("timeupdate", () => {
        console.log("playhead time: ", mediaElement.currentTime);
      });

      mediaElement.addEventListener("ratechange", () => {
        console.log("playback rate: ", mediaElement.playbackRate);
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
    const setManifestResponseUrl = (responseUrl: string) => {
      this.streamInfo.manifestResponseUrl = responseUrl;
      this.core.setManifestResponseUrl(responseUrl);
    };
    const handleLoading: shaka.extern.SchemePlugin = (...args) => {
      const loadingHandler = new LoadingHandler({
        shaka: this.shaka,
        streamInfo: this.streamInfo,
        segmentManager: this.segmentManager,
        core: this.core,
        setManifestResponseUrl,
      });
      return loadingHandler.handleLoading(...args);
    };
    this.shaka.net.NetworkingEngine.registerScheme("http", handleLoading);
    this.shaka.net.NetworkingEngine.registerScheme("https", handleLoading);
  }
}
