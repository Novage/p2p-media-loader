import "shaka-player/dist/shaka-player.compiled.d.ts";
import { HlsManifestParser } from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import { Segment } from "./segment";
import Debug from "debug";

export class Engine {
  private player!: shaka.Player;
  private readonly segmentManager: SegmentManager = new SegmentManager();
  private debug = Debug("p2pml-shaka:engine");

  initShakaPlayer(shaka: any, player: shaka.Player) {
    self.shaka = shaka;
    this.player = player;

    this.initializeNetworkingEngine();
    this.registerParsers();
  }

  private registerParsers() {
    const factory = () => new HlsManifestParser(this.segmentManager);
    shaka.media.ManifestParser.registerParserByExtension("m3u8", factory);
    shaka.media.ManifestParser.registerParserByMime(
      "application/x-mpegurl",
      factory
    );
    shaka.media.ManifestParser.registerParserByMime(
      "application/vnd.apple.mpegurl",
      factory
    );
  }

  private initializeNetworkingEngine() {
    shaka.net.NetworkingEngine.registerScheme(
      "http",
      this.processNetworkRequest
    );
    shaka.net.NetworkingEngine.registerScheme(
      "https",
      this.processNetworkRequest
    );
  }

  private processNetworkRequest: shaka.extern.SchemePlugin = (
    url,
    request,
    requestType,
    progressUpdated,
    receivedHeaders
  ) => {
    const xhrPlugin = shaka.net.HttpXHRPlugin;
    const result = xhrPlugin.parse(
      url,
      request,
      requestType,
      progressUpdated,
      receivedHeaders
    );

    if (requestType === shaka.net.NetworkingEngine.RequestType.MANIFEST) {
      this.debug("Manifest is loading");
    }
    if (requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      const byteRange = Segment.getByteRangeFromHeaderString(
        request.headers.Range
      );
      const segmentId = Segment.getLocalId(url, byteRange);
      const segment = this.segmentManager.getSegment(segmentId);
      this.debug(`Loading segment with id: ${segmentId}`);
      this.debug(`Stream id: ${segment?.streamId}`);
    }

    return result;
  };
}
