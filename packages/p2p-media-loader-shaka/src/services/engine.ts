import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import { Segment } from "./segment";
import Debug from "debug";
import { StreamInfo, StreamProtocol, StreamType } from "../types/types";
import { MasterManifest, Parser, PlaylistManifest } from "m3u8-parser";

export class Engine {
  private player!: shaka.Player;
  private readonly streamInfo: StreamInfo = {
    mediaSequence: { video: 0, audio: 0 },
  };
  private hlsStreamType?: Map<string, StreamType>;

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

  private async getContent(
    request: shaka.extern.IAbortableOperation<any>
  ): Promise<{
    content: string;
    responseUrl: string;
  }> {
    const response = await request.promise;
    return {
      content: new TextDecoder().decode(response.data),
      responseUrl: response.uri,
    };
  }

  private async parseHlsPlaylistRetrieveMediaSequence(
    url: string,
    request: shaka.extern.IAbortableOperation<any>
  ) {
    if (!this.hlsStreamType) return;
    const { content: playlist } = await this.getContent(request);
    const mediaType = this.hlsStreamType.get(url);
    if (mediaType !== "video" && mediaType !== "audio") return;

    const mediaSequenceStr = playlist.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1];
    const mediaSequence = mediaSequenceStr ? parseInt(mediaSequenceStr) : 0;
    if (mediaType === "video") {
      this.streamInfo.mediaSequence.video = mediaSequence;
    } else {
      this.streamInfo.mediaSequence.audio = mediaSequence;
    }
  }

  private async parseM3U8MasterManifest(
    request: shaka.extern.IAbortableOperation<any>
  ) {
    const { content, responseUrl } = await this.getContent(request);

    const parser = new Parser();
    parser.push(content);
    parser.end();

    const { manifest } = parser;
    if (isMasterManifest(manifest)) {
      const { playlists, mediaGroups } = manifest;
      this.hlsStreamType = new Map();
      for (const playlist of playlists) {
        const url = new URL(playlist.uri, responseUrl).toString();
        this.hlsStreamType.set(url, "video");
      }

      const audio = Object.values(mediaGroups.AUDIO);
      if (audio.length) {
        audio.forEach((languageMap) => {
          const languages = Object.values(languageMap);
          languages.forEach((item) => {
            const url = new URL(item.uri, responseUrl).toString();
            this.hlsStreamType?.set(url, "audio");
          });
        });
      }
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

      if (this.streamInfo.protocol === "hls") {
        if (!this.hlsStreamType) {
          void this.parseM3U8MasterManifest(result);
        } else {
          void this.parseHlsPlaylistRetrieveMediaSequence(url, result);
        }
      }
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

function isMasterManifest(
  manifest: PlaylistManifest | MasterManifest
): manifest is MasterManifest {
  const { mediaGroups, playlists } = manifest as MasterManifest;
  return (
    playlists !== undefined &&
    Array.isArray(playlists) &&
    mediaGroups !== undefined &&
    typeof mediaGroups === "object"
  );
}
