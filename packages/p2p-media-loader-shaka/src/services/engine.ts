import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { StreamInfo, StreamProtocol } from "../types/types";
import { getLoadingHandler } from "./loading-handler";

export class Engine {
  private player!: shaka.Player;
  private readonly streamInfo: StreamInfo = {};

  private readonly segmentManager: SegmentManager = new SegmentManager(
    this.streamInfo
  );
  private debug = Debug("p2pml-shaka:engine");

  initShakaPlayer(player: shaka.Player) {
    this.player = player;
    this.initializeNetworkingEngine();
    this.registerParsers();
  }

  private registerParsers() {
    const setProtocol = (protocol: StreamProtocol) =>
      (this.streamInfo.protocol = protocol);
    const hlsParserFactory = () =>
      new HlsManifestParser(this.segmentManager, setProtocol);
    const dashParserFactory = () =>
      new DashManifestParser(this.segmentManager, setProtocol);
    shaka.media.ManifestParser.registerParserByExtension(
      "mpd",
      dashParserFactory
    );
    shaka.media.ManifestParser.registerParserByMime(
      "application/dash+xml",
      dashParserFactory
    );
    shaka.media.ManifestParser.registerParserByExtension(
      "m3u8",
      hlsParserFactory
    );
    shaka.media.ManifestParser.registerParserByMime(
      "application/x-mpegurl",
      hlsParserFactory
    );
    shaka.media.ManifestParser.registerParserByMime(
      "application/vnd.apple.mpegurl",
      hlsParserFactory
    );
  }

  private initializeNetworkingEngine() {
    const loadingHandler = getLoadingHandler(
      this.segmentManager,
      this.streamInfo,
      this.debug
    );
    shaka.net.NetworkingEngine.registerScheme("http", loadingHandler);
    shaka.net.NetworkingEngine.registerScheme("https", loadingHandler);
  }
}
