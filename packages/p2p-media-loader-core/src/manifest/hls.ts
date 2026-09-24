// Ambient typings for untyped packages must travel with the modules that
// import them, so other packages compiling these sources see them too.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendor-types.d.ts" />
import {
  Parser,
  type M3u8Manifest,
  type M3u8PlaylistAttributes,
} from "m3u8-parser";
import type {
  ManifestParser,
  ParsedManifest,
  ParsedSegment,
  ParsedStream,
  ParsedInitSegment,
} from "./types.js";
import {
  audioCodecs,
  audioStreamProperties,
  videoRenditionProperties,
  videoStreamProperties,
  type VideoAttributes,
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
 *
 * Only video and audio are streams. A master's subtitle renditions and
 * I-frame playlists are not, and are reported by URL instead so that the
 * registry knows their media playlists when they arrive; an I-frame media
 * playlist says so itself. See specs/manifest-registry.md, "Segments core
 * does not register".
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

    if (manifest.playlists?.length) {
      return { protocol: "hls", url, ...masterStreams(manifest, text, url) };
    }
    // Trick play only, and declared as such: nothing here is a stream.
    if (manifest.iFramesOnly) return { protocol: "hls", url, streams: [] };
    return { protocol: "hls", url, streams: [mediaStream(manifest, url)] };
  },
};

/**
 * Every playlist a master names with a URI that is not one of its streams:
 * I-frame playlists, subtitle renditions, and the renditions of any group no
 * variant references — nothing plays those, and declared they would carry an
 * identity made of a name alone. One rule for all of them: a URI a declared
 * stream already has is that stream's, however else the master labels it.
 * Closed captions ride inside the variants and name no playlist.
 */
function excludedPlaylists(
  manifest: M3u8Manifest,
  url: string,
  declared: ReadonlySet<string>,
): string[] {
  const named: string[] = [];
  for (const { uri } of manifest.iFramePlaylists ?? []) {
    if (uri) named.push(uri);
  }
  const mediaGroups = manifest.mediaGroups ?? {};
  for (const type of ["SUBTITLES", "VIDEO", "AUDIO"] as const) {
    const groups = mediaGroups[type] ?? {};
    for (const groupId of Object.keys(groups)) {
      const renditions = groups[groupId];
      for (const name of Object.keys(renditions)) {
        const { uri } = renditions[name];
        if (uri) named.push(uri);
      }
    }
  }
  const urls = new Set<string>();
  for (const uri of named) {
    const key = resolveUrl(uri, url);
    if (!declared.has(key)) urls.add(key);
  }
  return Array.from(urls);
}

function masterStreams(
  manifest: M3u8Manifest,
  text: string,
  url: string,
): Pick<ParsedManifest, "streams" | "excludedPlaylists"> {
  const streams: ParsedStream[] = [];
  const channelsByGroupAndName = scanAudioChannels(text);

  // Alternate audio renditions inherit codecs from the variants that reference
  // their group, the way HLS.js assigns `audioCodec` to an audio track. A
  // group no variant references is no stream at all; see `excludedPlaylists`.
  const audioGroups = new Set<string>();
  const audioCodecsByGroup = new Map<string, string>();
  // Alternate video renditions inherit everything from the first variant that
  // references their group. RFC 8216 requires every rendition to match the
  // resolution of each variant referencing the group, so a master that reuses
  // one group across tiers is malformed, and the first reading is taken.
  const videoAttributesByGroup = new Map<string, VideoAttributes>();
  const keys = new Set<string>();

  for (const playlist of manifest.playlists ?? []) {
    const a = playlist.attributes;
    const key = resolveUrl(playlist.uri, url);
    keys.add(key);
    streams.push({
      key,
      type: "main",
      properties: videoStreamProperties(variantAttributes(a)),
      indexSource: { kind: "manifest" },
    });
    const audio = audioCodecs(a.CODECS);
    if (a.AUDIO) audioGroups.add(a.AUDIO);
    if (a.AUDIO && audio && !audioCodecsByGroup.has(a.AUDIO)) {
      audioCodecsByGroup.set(a.AUDIO, audio);
    }
    if (a.VIDEO && !videoAttributesByGroup.has(a.VIDEO)) {
      videoAttributesByGroup.set(a.VIDEO, variantAttributes(a));
    }
  }

  streams.push(
    ...videoRenditionStreams(manifest, url, videoAttributesByGroup, keys),
  );

  const groups = manifest.mediaGroups?.AUDIO ?? {};
  for (const groupId of Object.keys(groups)) {
    if (!audioGroups.has(groupId)) continue;
    const renditions = groups[groupId];
    for (const name of Object.keys(renditions)) {
      const rendition = renditions[name];
      // A rendition without a URI is muxed into the variants; nothing to load.
      if (!rendition.uri) continue;
      const key = resolveUrl(rendition.uri, url);
      // A URI a variant or a video rendition already has is malformed; the
      // stream declared first keeps it.
      if (keys.has(key)) continue;
      keys.add(key);
      streams.push({
        key,
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

  return { streams, excludedPlaylists: excludedPlaylists(manifest, url, keys) };
}

function variantAttributes(a: M3u8PlaylistAttributes): VideoAttributes {
  return {
    bandwidth: a.BANDWIDTH,
    codecs: a.CODECS,
    width: a.RESOLUTION?.width,
    height: a.RESOLUTION?.height,
    frameRate: a["FRAME-RATE"],
    videoRange: a["VIDEO-RANGE"],
  };
}

/**
 * Alternate video renditions — camera angles — with a playlist of their own,
 * one main stream each. RFC 8216 gives a rendition the characteristics of the
 * variant that references its group, and Shaka, the one player here that
 * plays them, builds its video stream from exactly those, so the variant's
 * attributes are the rendition's identity, told from the variant by `NAME`.
 * A rendition whose URI is a variant's own is that variant, and one without a
 * URI is muxed into it: neither is a stream of its own. `keys` holds every
 * stream declared so far, and every rendition declared here is added to it.
 */
function videoRenditionStreams(
  manifest: M3u8Manifest,
  url: string,
  attributesByGroup: ReadonlyMap<string, VideoAttributes>,
  keys: Set<string>,
): ParsedStream[] {
  const streams: ParsedStream[] = [];
  const groups = manifest.mediaGroups?.VIDEO ?? {};
  for (const [groupId, attributes] of attributesByGroup) {
    const renditions = groups[groupId] ?? {};
    for (const name of Object.keys(renditions)) {
      const rendition = renditions[name];
      if (!rendition.uri) continue;
      const key = resolveUrl(rendition.uri, url);
      if (keys.has(key)) continue;
      keys.add(key);
      streams.push({
        key,
        type: "main",
        properties: videoRenditionProperties(attributes, {
          name,
          language: rendition.language,
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
