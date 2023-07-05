import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { StreamInfo, StreamProtocol, Shaka } from "../types/types";
import { getLoadingHandler } from "./loading-handler";

export class Engine {
  private readonly shaka: Shaka;
  private player!: shaka.Player;
  private readonly streamInfo: StreamInfo = {};
  private readonly segmentManager: SegmentManager = new SegmentManager(
    this.streamInfo
  );
  private debug = Debug("p2pml-shaka:engine");

  constructor(shaka?: unknown) {
    this.shaka = (shaka as Shaka | undefined) ?? window.shaka;
  }

  initShakaPlayer(player: shaka.Player) {
    this.player = player;
    this.initializeNetworkingEngine();
    this.registerParsers();
  }

  private registerParsers() {
    const setProtocol = (protocol: StreamProtocol) =>
      (this.streamInfo.protocol = protocol);
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
    const loadingHandler = getLoadingHandler(
      this.shaka,
      this.segmentManager,
      this.streamInfo,
      this.debug
    );
    this.shaka.net.NetworkingEngine.registerScheme("http", loadingHandler);
    this.shaka.net.NetworkingEngine.registerScheme("https", loadingHandler);
  }
}
