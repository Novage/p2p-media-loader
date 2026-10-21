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
 * nothing. Two things are added on top of the library from the master's text:
 * `CHANNELS` on `EXT-X-MEDIA`, which m3u8-parser drops, and the order of the
 * renditions in a group, which its name-keyed object can lose.
 *
 * A master's streams get their default stream IDs here: the type and the
 * index among the master's streams of that type (`main0`, `secondary1`). See
 * specs/segment-identity.md, "HLS: the stream's place in the master".
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
 * variant references — nothing plays those, and declared they would take an
 * index from a stream that plays. One rule for all of them: a URI a declared
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
  const mediaTags = scanMediaTags(text);
  const counts = { main: 0, secondary: 0 };
  const declare = (stream: Omit<ParsedStream, "streamId" | "index">) => {
    const index = counts[stream.type]++;
    streams.push({ ...stream, streamId: `${stream.type}${index}`, index });
  };

  // Alternate audio renditions inherit codecs from the variants that reference
  // their group, the way HLS.js assigns `audioCodec` to an audio track. A
  // group no variant references is no stream at all; see `excludedPlaylists`.
  const audioCodecsByGroup = new Map<string, string | undefined>();
  // Alternate video renditions inherit everything from the first variant that
  // references their group. RFC 8216 requires every rendition to match the
  // resolution of each variant referencing the group, so a master that reuses
  // one group across tiers is malformed, and the first reading is taken.
  const videoAttributesByGroup = new Map<string, VideoAttributes>();
  const keys = new Set<string>();

  for (const playlist of manifest.playlists ?? []) {
    const a = playlist.attributes;
    const attributes = variantAttributes(a);
    const audio = audioCodecs(a.CODECS);
    if (a.AUDIO && audioCodecsByGroup.get(a.AUDIO) === undefined) {
      audioCodecsByGroup.set(a.AUDIO, audio);
    }
    if (a.VIDEO && !videoAttributesByGroup.has(a.VIDEO)) {
      videoAttributesByGroup.set(a.VIDEO, attributes);
    }
    const key = resolveUrl(playlist.uri, url);
    // One playlist listed under several EXT-X-STREAM-INF, one per audio
    // group, is one stream; the first listing declares it. Copies of a
    // rendition under other URIs — for each CDN or pathway — are streams of
    // their own.
    if (keys.has(key)) continue;
    keys.add(key);
    declare({
      key,
      type: "main",
      properties: videoStreamProperties(attributes),
      indexSource: { kind: "manifest" },
    });
  }

  const videoGroups = manifest.mediaGroups?.VIDEO ?? {};
  for (const [groupId, attributes] of videoAttributesByGroup) {
    const renditions = videoGroups[groupId] ?? {};
    for (const name of mediaTags.namesInOrder("VIDEO", groupId, renditions)) {
      const rendition = renditions[name];
      // A rendition without a URI is the variant itself; nothing to load.
      if (!rendition.uri) continue;
      const key = resolveUrl(rendition.uri, url);
      if (keys.has(key)) continue;
      keys.add(key);
      declare({
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

  const audioGroups = manifest.mediaGroups?.AUDIO ?? {};
  for (const [groupId, codecs] of audioCodecsByGroup) {
    const renditions = audioGroups[groupId] ?? {};
    for (const name of mediaTags.namesInOrder("AUDIO", groupId, renditions)) {
      const rendition = renditions[name];
      // A rendition without a URI is muxed into the variants; nothing to load.
      if (!rendition.uri) continue;
      const key = resolveUrl(rendition.uri, url);
      // An audio-only master may name a variant's own playlist as a
      // rendition of its group: that is the variant, declared already.
      if (keys.has(key)) continue;
      keys.add(key);
      declare({
        key,
        type: "secondary",
        properties: audioStreamProperties({
          codecs,
          language: rendition.language,
          channels: mediaTags.channels.get(`${groupId} ${name}`),
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

  // The parser hands every segment a map applies to the same object, so each
  // is resolved once rather than once per segment.
  const maps = new Set((manifest.segments ?? []).map((s) => s.map));
  const initSegments: ParsedInitSegment[] = [];
  for (const map of maps) {
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
 * Reads what m3u8-parser does not keep from the master's `EXT-X-MEDIA` tags:
 * `CHANNELS` of each audio rendition, keyed by `${GROUP-ID} ${NAME}`, and the
 * order of the renditions in each group. m3u8-parser keys a group's
 * renditions by `NAME` in an object, and an object lists integer-like keys
 * (`NAME="1"`) before the others and in numeric order, not in the master's.
 */
function scanMediaTags(text: string) {
  const channels = new Map<string, string>();
  const names = new Map<string, string[]>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    const attrs = parseAttributeList(line.slice("#EXT-X-MEDIA:".length));
    const type = attrs.get("TYPE");
    const groupId = attrs.get("GROUP-ID");
    const name = attrs.get("NAME");
    if (!type || groupId === undefined || name === undefined) continue;
    const group = `${type} ${groupId}`;
    names.set(group, [...(names.get(group) ?? []), name]);
    const channelCount = attrs.get("CHANNELS");
    if (type === "AUDIO" && channelCount) {
      channels.set(`${groupId} ${name}`, channelCount);
    }
  }
  return {
    channels,
    /** The names of a group's renditions in the master's order. */
    namesInOrder(
      type: "AUDIO" | "VIDEO",
      groupId: string,
      renditions: object,
    ): string[] {
      const ordered = new Set(
        (names.get(`${type} ${groupId}`) ?? []).filter((name) =>
          Object.prototype.hasOwnProperty.call(renditions, name),
        ),
      );
      for (const name of Object.keys(renditions)) ordered.add(name);
      return Array.from(ordered);
    },
  };
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
