import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import {
  StreamInfo,
  Shaka,
  Stream,
  HookedNetworkingEngine,
  HookedRequest,
  P2PMLShakaData,
} from "./types";
import { Loader } from "./loading-handler";
import { Core, CoreEventHandlers } from "p2p-media-loader-core";

const LIVE_EDGE_DELAY = 25;

export class Engine {
  private player?: shaka.Player;
  private readonly shaka: Shaka;
  private readonly streamInfo: StreamInfo = {};
  private readonly core: Core<Stream>;
  private readonly segmentManager: SegmentManager;
  private requestFilter?: shaka.extern.RequestFilter;

  constructor(shaka?: unknown, eventHandlers?: CoreEventHandlers) {
    this.shaka = (shaka as Shaka | undefined) ?? window.shaka;
    this.core = new Core(eventHandlers);
    this.segmentManager = new SegmentManager(this.streamInfo, this.core);
  }

  configureAndInitShakaPlayer(player: shaka.Player) {
    if (this.player === player) return;
    if (this.player) this.destroy();
    this.player = player;
    this.player.configure("manifest.defaultPresentationDelay", LIVE_EDGE_DELAY);
    this.player.configure(
      "manifest.dash.ignoreSuggestedPresentationDelay",
      true
    );
    this.updatePlayerEventHandlers("register");
  }

  private updatePlayerEventHandlers = (type: "register" | "unregister") => {
    const { player } = this;
    if (!player) return;

    const networkingEngine =
      player.getNetworkingEngine() as HookedNetworkingEngine | null;
    if (networkingEngine) {
      if (type === "register") {
        const p2pml: P2PMLShakaData = {
          player: this.player,
          shaka: this.shaka,
          core: this.core,
          streamInfo: this.streamInfo,
          segmentManager: this.segmentManager,
        };
        this.requestFilter = (requestType, request) => {
          (request as HookedRequest).p2pml = p2pml;
        };
        networkingEngine.p2pml = p2pml;
        networkingEngine.registerRequestFilter(this.requestFilter);
      } else {
        networkingEngine.p2pml = undefined;
        if (this.requestFilter) {
          networkingEngine.unregisterRequestFilter(this.requestFilter);
        }
      }
    }
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    player[method]("loaded", this.handlePlayerLoaded);
    player[method]("loading", this.destroyCurrentStreamContext);
    player[method]("unloading", this.handlePlayerUnloading);
    player[method]("adaptation", this.onVariantChanged);
    player[method]("variantchanged", this.onVariantChanged);
  };

  private onVariantChanged = () => {
    if (!this.player) return;
    const activeTrack = this.player
      .getVariantTracks()
      .find((track) => track.active);

    if (!activeTrack) return;
    this.core.setActiveLevelBitrate(activeTrack.bandwidth);
  };

  private handlePlayerLoaded = () => {
    if (!this.player) return;
    this.core.setIsLive(this.player.isLive());
    this.updateMediaElementEventHandlers("register");
  };

  private handlePlayerUnloading = () => {
    this.destroyCurrentStreamContext();
    this.updateMediaElementEventHandlers("unregister");
  };

  private destroyCurrentStreamContext = () => {
    this.streamInfo.protocol = undefined;
    this.streamInfo.manifestResponseUrl = undefined;
    this.core.destroy();
  };

  private updateMediaElementEventHandlers = (
    type: "register" | "unregister"
  ) => {
    const media = this.player?.getMediaElement();
    if (!media) return;
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    media[method]("timeupdate", this.handlePlaybackUpdate);
    media[method]("ratechange", this.handlePlaybackUpdate);
    media[method]("seeking", this.handlePlaybackUpdate);
  };

  private handlePlaybackUpdate = (event: Event) => {
    const media = event.target as HTMLVideoElement;
    this.core.updatePlayback(media.currentTime, media.playbackRate);
  };

  destroy() {
    this.destroyCurrentStreamContext();
    this.updatePlayerEventHandlers("unregister");
    this.updateMediaElementEventHandlers("unregister");
    this.player = undefined;
  }

  private static registerManifestParsers(shaka: Shaka) {
    const hlsParserFactory = () => new HlsManifestParser(shaka);
    const dashParserFactory = () => new DashManifestParser(shaka);

    const Parser = shaka.media.ManifestParser;
    Parser.registerParserByExtension("mpd", dashParserFactory);
    Parser.registerParserByMime("application/dash+xml", dashParserFactory);
    Parser.registerParserByExtension("m3u8", hlsParserFactory);
    Parser.registerParserByMime("application/x-mpegurl", hlsParserFactory);
    Parser.registerParserByMime(
      "application/vnd.apple.mpegurl",
      hlsParserFactory
    );
  }

  private static unregisterManifestParsers(shaka: Shaka) {
    const Parser = shaka.media.ManifestParser;
    Parser.unregisterParserByMime("mpd");
    Parser.unregisterParserByMime("application/dash+xml");
    Parser.unregisterParserByMime("m3u8");
    Parser.unregisterParserByMime("application/x-mpegurl");
    Parser.unregisterParserByMime("application/vnd.apple.mpegurl");
  }

  private static registerNetworkingEngineSchemes(shaka: Shaka) {
    const { NetworkingEngine } = shaka.net;

    const handleLoading: shaka.extern.SchemePlugin = (...args) => {
      const request = args[1] as HookedRequest;
      const { p2pml } = request;
      if (!p2pml) return shaka.net.HttpFetchPlugin.parse(...args);

      const loader = new Loader(p2pml.shaka, p2pml.core, p2pml.streamInfo);
      return loader.load(...args);
    };
    NetworkingEngine.registerScheme("http", handleLoading);
    NetworkingEngine.registerScheme("https", handleLoading);
  }

  private static unregisterNetworkingEngineSchemes(shaka: Shaka) {
    const { NetworkingEngine } = shaka.net;
    NetworkingEngine.unregisterScheme("http");
    NetworkingEngine.unregisterScheme("https");
  }

  static setGlobalSettings(shaka?: unknown) {
    const shakaGlobal = (shaka as Shaka | undefined) ?? window.shaka;
    Engine.registerManifestParsers(shakaGlobal);
    Engine.registerNetworkingEngineSchemes(shakaGlobal);
  }

  static unsetGlobalSettings(shaka?: unknown) {
    const shakaGlobal = (shaka as Shaka | undefined) ?? window.shaka;
    Engine.unregisterManifestParsers(shakaGlobal);
    Engine.unregisterNetworkingEngineSchemes(shakaGlobal);
  }
}
