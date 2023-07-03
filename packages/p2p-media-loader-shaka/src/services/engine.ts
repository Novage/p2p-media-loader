import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import { Segment } from "./segment";
import Debug from "debug";
import { StreamInfo, StreamProtocol } from "../types/types";

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
    const xhrPlugin = shaka.net.HttpFetchPlugin;
    const result = xhrPlugin.parse(
      url,
      request,
      requestType,
      progressUpdated,
      receivedHeaders
    );
    if (requestType === shaka.net.NetworkingEngine.RequestType.MANIFEST) {
      if (
        this.streamInfo.protocol === "hls" &&
        this.segmentManager.urlStreamMap.has(url)
      ) {
        (async () => {
          await result.promise;
          //Waiting for playlist is parsed
          await new Promise((res) => setTimeout(res, 0));
          this.segmentManager.updateHLSStreamByUrl(url);
        })();
      }
    }
    if (requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      const segmentId = Segment.getLocalId(url, request.headers.Range);
      const stream = this.segmentManager.getStreamBySegmentLocalId(segmentId);
      const segment = stream?.segments.get(segmentId);
      this.debug(`\n\nLoading segment with id: ${segmentId}`);
      this.debug(`Stream id: ${stream?.id}`);
      this.debug(`Segment: ${segment?.index}`);
    }

    return result;
  };
}
