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
  private readonly streamInfo: StreamInfo = {
    mediaSequence: { video: 0, audio: 0 },
  };

  private readonly segmentManager: SegmentManager = new SegmentManager(
    this.streamInfo
  );
  private debug = Debug("p2pml-shaka:engine");

  initShakaPlayer(shaka: any, player: shaka.Player) {
    self.shaka = shaka;
    this.player = player;
    this.initializeNetworkingEngine();
    this.registerParsers();

    console.log(shaka.hls.HlsParser);
  }

  private registerParsers() {
    const hlsParserFactory = () =>
      new HlsManifestParser(this.segmentManager, this.streamInfo);
    const dashParserFactory = () =>
      new DashManifestParser(this.segmentManager, this.streamInfo);
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

  private async parseAndSetMediaSequence(
    request: shaka.extern.IAbortableOperation<any>
  ) {
    const response = await request.promise;
    const playlist = new TextDecoder().decode(response.data);
    const mediaLine = playlist.match(/#EXT-X-MEDIA:(.*)/)?.[1];
    const mediaType = mediaLine?.match(/TYPE=([^,]+)/)?.[1];
    if (mediaType !== "VIDEO" && mediaType !== "AUDIO") return;

    const mediaSequenceStr = playlist.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1];
    const mediaSequence = mediaSequenceStr ? parseInt(mediaSequenceStr) : 0;
    if (mediaType === "VIDEO") {
      this.streamInfo.mediaSequence.video = mediaSequence;
    } else {
      this.streamInfo.mediaSequence.audio = mediaSequence;
    }
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
      this.streamInfo.lastLoadedStreamUrl = url;
      // console.log("playlist: ", url);
      // if (this.streamInfo.protocol === "hls") {
      //   void this.parseAndSetMediaSequence(result);
      // }
    }
    if (requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
      const byteRange = Segment.getByteRangeFromHeaderString(
        request.headers.Range
      );
      const segmentId = Segment.getLocalId(url, byteRange);
      const stream = this.segmentManager.getStreamBySegmentLocalId(segmentId);
      this.debug(`Loading segment with id: ${segmentId}`);
      this.debug(`Stream id: ${stream?.id}`);
    }

    return result;
  };
}
