// Ambient typings for untyped packages must travel with the modules that
// import them, so other packages compiling these sources see them too.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendor-types.d.ts" />
import { Parser, type M3u8Manifest } from "m3u8-parser";
import type {
  ManifestParser,
  ParsedSegment,
  ParsedStream,
  ParsedInitSegment,
} from "./types.js";
import {
  audioCodecs,
  audioStreamProperties,
  videoStreamProperties,
} from "./properties.js";
import {
  byteRangeFromOffsetLength,
  distinctInitSegments,
  resolveUrl,
} from "./url-key.js";

/**
 * HLS tokenizer over m3u8-parser. Produces `ParsedManifest`; interprets
 * nothing. The one thing added on top of the library is `CHANNELS` on
 * `EXT-X-MEDIA`, which m3u8-parser drops and which feeds audio identity.
 */
export const hlsManifestParser: ManifestParser = {
  protocol: "hls",

  canParse(text) {
    return /^\s*#EXTM3U/.test(text);
  },

  parse(text, url) {
    const parser = new Parser();
    parser.push(text);
    parser.end();
    const { manifest } = parser;

    const streams = manifest.playlists?.length
      ? masterStreams(manifest, text, url)
      : [mediaStream(manifest, url)];

    return { protocol: "hls", url, streams };
  },
};

function masterStreams(
  manifest: M3u8Manifest,
  text: string,
  url: string,
): ParsedStream[] {
  const streams: ParsedStream[] = [];
  const channelsByGroupAndName = scanAudioChannels(text);

  // Alternate audio renditions inherit codecs from the variants that reference
  // their group, the way HLS.js assigns `audioCodec` to an audio track.
  const audioCodecsByGroup = new Map<string, string>();

  for (const playlist of manifest.playlists ?? []) {
    const a = playlist.attributes;
    streams.push({
      key: resolveUrl(playlist.uri, url),
      type: "main",
      properties: videoStreamProperties({
        bandwidth: a.BANDWIDTH,
        codecs: a.CODECS,
        width: a.RESOLUTION?.width,
        height: a.RESOLUTION?.height,
        frameRate: a["FRAME-RATE"],
        videoRange: a["VIDEO-RANGE"],
      }),
      indexSource: { kind: "manifest" },
    });
    const audio = audioCodecs(a.CODECS);
    if (a.AUDIO && audio && !audioCodecsByGroup.has(a.AUDIO)) {
      audioCodecsByGroup.set(a.AUDIO, audio);
    }
  }

  const groups = manifest.mediaGroups?.AUDIO ?? {};
  for (const groupId of Object.keys(groups)) {
    const renditions = groups[groupId];
    for (const name of Object.keys(renditions)) {
      const rendition = renditions[name];
      // A rendition without a URI is muxed into the variants; nothing to load.
      if (!rendition.uri) continue;
      streams.push({
        key: resolveUrl(rendition.uri, url),
        type: "secondary",
        properties: audioStreamProperties({
          codecs: audioCodecsByGroup.get(groupId),
          language: rendition.language,
          channels: channelsByGroupAndName.get(`${groupId} ${name}`),
          name,
        }),
        indexSource: { kind: "manifest" },
      });
    }
  }

  return streams;
}

function mediaStream(manifest: M3u8Manifest, url: string): ParsedStream {
  const mediaSequence = manifest.mediaSequence ?? 0;

  // Partial segments and preload hints are present on the parse but are never
  // emitted: nothing at the live edge is shareable.
  const segments: ParsedSegment[] = (manifest.segments ?? []).map(
    (s, index) => ({
      url: resolveUrl(s.uri, url),
      byteRange: byteRangeFromOffsetLength(s.byterange),
      duration: s.duration,
      sequence: mediaSequence + index,
      programDateTime: s.programDateTime,
    }),
  );

  const initSegments: ParsedInitSegment[] = [];
  for (const { map } of manifest.segments ?? []) {
    if (!map) continue;
    initSegments.push({
      url: resolveUrl(map.uri, url),
      byteRange: byteRangeFromOffsetLength(map.byterange),
    });
  }

  return {
    key: url,
    // A media playlist alone cannot say whether it is video or audio; the
    // master that declared it does. The registry keeps the master's type.
    type: "main",
    properties: { bitrate: 0 },
    segments,
    initSegments: distinctInitSegments(initSegments),
    indexSource: { kind: "manifest" },
    // The sole reliable live signal is EXT-X-ENDLIST; PLAYLIST-TYPE is
    // optional and its absence proves nothing.
    isLive: manifest.endList !== true && manifest.playlistType !== "VOD",
  };
}

/**
 * `CHANNELS` per `(GROUP-ID, NAME)` from the raw `EXT-X-MEDIA` lines.
 * m3u8-parser does not retain the attribute, and HLS.js does, so without this
 * the two would hash audio renditions differently.
 */
function scanAudioChannels(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    const attrs = parseAttributeList(line.slice("#EXT-X-MEDIA:".length));
    if (attrs.get("TYPE") !== "AUDIO") continue;
    const groupId = attrs.get("GROUP-ID");
    const name = attrs.get("NAME");
    const channels = attrs.get("CHANNELS");
    if (groupId && name && channels) {
      result.set(`${groupId} ${name}`, channels);
    }
  }
  return result;
}

/** RFC 8216 attribute list: `KEY=VALUE,KEY="quoted, value"`. */
function parseAttributeList(list: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(list)) !== null) {
    const raw = match[2];
    attrs.set(match[1], raw.startsWith('"') ? raw.slice(1, -1) : raw);
  }
  return attrs;
}
