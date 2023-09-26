import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import {
  StreamInfo,
  Shaka,
  Stream,
  HookedNetworkingEngine,
  HookedRequest,
  P2PMLShakaData,
} from "./types";
import { LoadingHandler } from "./loading-handler";
import { decorateMethod } from "./utils";
import { Core } from "p2p-media-loader-core";

export class Engine {
  private readonly shaka: Shaka;
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
    const networkingEngine =
      player.getNetworkingEngine() as HookedNetworkingEngine | null;
    if (networkingEngine) {
      const p2pml: P2PMLShakaData = {
        shaka: this.shaka,
        core: this.core,
        streamInfo: this.streamInfo,
        segmentManager: this.segmentManager,
      };
      networkingEngine.p2pml = p2pml;
      networkingEngine.registerRequestFilter((requestType, request) => {
        (request as HookedRequest).p2pml = p2pml;
      }).p2pml = this;
    }

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
    const hlsParserFactory = () => new HlsManifestParser(this.shaka);
    const dashParserFactory = () => new DashManifestParser(this.shaka);
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
      const request = args[1] as HookedRequest;
      const { p2pml } = request;
      if (!p2pml) return this.shaka.net.HttpFetchPlugin.parse(...args);

      const loadingHandler = new LoadingHandler(
        p2pml.shaka,
        p2pml.core,
        p2pml.streamInfo,
        p2pml.segmentManager
      );
      return loadingHandler.handleLoading(...args);
    };

    this.shaka.net.NetworkingEngine.registerScheme("http", handleLoading);
    this.shaka.net.NetworkingEngine.registerScheme("https", handleLoading);
  }
}
