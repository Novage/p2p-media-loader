// Ambient typings for untyped packages must travel with the modules that
// import them, so other packages compiling these sources see them too.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendor-types.d.ts" />
import { parse, stringToMpdXml, type MpdPlaylist } from "mpd-parser";
import { ensureObjectValues } from "./shims/object-values.js";
import type {
  ManifestParser,
  ParsedSegment,
  ParsedStream,
  SegmentIndexSource,
} from "./types.js";
import { audioStreamProperties, videoStreamProperties } from "./properties.js";
import { byteRangeFromOffsetLength } from "./url-key.js";
import type { StreamProperties, StreamType } from "../types.js";

// Supplies a builtin mpd-parser assumes; must run before the first parse.
ensureObjectValues();

/**
 * DASH tokenizer over mpd-parser. Produces `ParsedManifest`; interprets
 * nothing. An MPD declares streams and segments in one document, so every
 * stream here may carry segments — or, for `SegmentBase`, an external index.
 */
export const dashManifestParser: ManifestParser = {
  protocol: "dash",

  canParse(text) {
    return /<MPD[\s>]/.test(text.slice(0, 2048));
  },

  parse(text, url) {
    const manifest = parse(text, { manifestUri: url });
    // `type="dynamic"` is authoritative for live, and reading the attribute
    // directly survives changes in how the tokenizer summarises it.
    const isLive = /<MPD[^>]*\btype\s*=\s*["']dynamic["']/.test(
      text.slice(0, 4096),
    );

    // mpd-parser drops AudioChannelConfiguration; read it from the MPD itself.
    const channelsByRepresentation = scanAudioChannels(text);

    const streams: ParsedStream[] = [];
    for (const playlist of manifest.playlists) {
      streams.push(toStream(playlist, "main", isLive, videoProperties));
    }
    const groups = manifest.mediaGroups.AUDIO ?? {};
    for (const groupId of Object.keys(groups)) {
      const renditions = groups[groupId];
      for (const label of Object.keys(renditions)) {
        const rendition = renditions[label];
        for (const playlist of rendition.playlists) {
          streams.push(
            toStream(playlist, "secondary", isLive, (a) =>
              audioStreamProperties({
                codecs: a.CODECS,
                language: rendition.language,
                channels: a.NAME
                  ? channelsByRepresentation.get(a.NAME)
                  : undefined,
                // The Representation id is the one stable, manifest-given name
                // of an audio rendition; a label is optional and a parser may
                // synthesise one from language and role.
                name: a.NAME,
              }),
            ),
          );
        }
      }
    }

    return { protocol: "dash", url, streams };
  },
};

function videoProperties(a: MpdPlaylist["attributes"]): StreamProperties {
  return videoStreamProperties({
    bandwidth: a.BANDWIDTH,
    codecs: a.CODECS,
    width: a.RESOLUTION?.width,
    height: a.RESOLUTION?.height,
    frameRate: a["FRAME-RATE"],
  });
}

function toStream(
  playlist: MpdPlaylist,
  type: StreamType,
  isLive: boolean,
  properties: (a: MpdPlaylist["attributes"]) => StreamProperties,
): ParsedStream {
  const { sidx } = playlist;
  const indexSource: SegmentIndexSource = sidx
    ? {
        kind: "external",
        url: sidx.resolvedUri,
        byteRange: byteRangeFromOffsetLength(sidx.byterange) ?? {
          start: 0,
          end: 0,
        },
        periodStart: sidx.timeline ?? 0,
      }
    : { kind: "manifest" };

  const segments: ParsedSegment[] = playlist.segments.map((s) => ({
    url: s.resolvedUri,
    byteRange: byteRangeFromOffsetLength(s.byterange),
    duration: s.duration,
    sequence: s.number,
    presentationTime: s.presentationTime,
  }));

  // A SegmentBase representation lists no segments; its init segment hangs
  // off the index reference instead.
  const map = playlist.segments[0]?.map ?? sidx?.map;

  return {
    // The representation id is the only stable per-stream name an MPD offers.
    key: playlist.attributes.NAME ?? playlist.resolvedUri,
    type,
    properties: properties(playlist.attributes),
    segments,
    initSegment: map
      ? {
          url: map.resolvedUri,
          byteRange: byteRangeFromOffsetLength(map.byterange),
        }
      : undefined,
    indexSource,
    isLive,
  };
}

/**
 * Channel count per audio Representation id, from `AudioChannelConfiguration`
 * on the Representation or, failing that, its AdaptationSet. Only the MPEG
 * scheme (`urn:mpeg:dash:23003:3:audio_channel_configuration:2011`), whose
 * value is a plain count, is read; vendor schemes encode channel masks and are
 * left undefined rather than guessed.
 */
function scanAudioChannels(text: string): Map<string, number> {
  const result = new Map<string, number>();
  // mpd-parser's own DOM step, so the core has no XML dependency of its own:
  // in Node it resolves xmldom transitively, in browser bundles the alias in
  // vite.common.config.ts hands it the platform DOMParser.
  let doc: Document;
  try {
    doc = stringToMpdXml(text);
  } catch {
    return result;
  }

  // Array.from: DOM collections are not iterable under the ES2015 lib target.
  for (const set of Array.from(doc.getElementsByTagName("AdaptationSet"))) {
    const setChannels = channelCountOf(set);
    for (const representation of Array.from(
      set.getElementsByTagName("Representation"),
    )) {
      const id = representation.getAttribute("id");
      const channels = channelCountOf(representation) ?? setChannels;
      if (id && channels !== undefined) result.set(id, channels);
    }
  }
  return result;
}

const MPEG_CHANNEL_SCHEME = "23003:3:audio_channel_configuration";

function channelCountOf(element: Element): number | undefined {
  for (const child of Array.from(element.childNodes)) {
    if (
      child.nodeType !== 1 ||
      (child as Element).localName !== "AudioChannelConfiguration"
    ) {
      continue;
    }
    const config = child as Element;
    if (
      !(config.getAttribute("schemeIdUri") ?? "").includes(MPEG_CHANNEL_SCHEME)
    ) {
      continue;
    }
    const value = Number(config.getAttribute("value"));
    if (Number.isInteger(value) && value > 0) return value;
  }
  return undefined;
}
