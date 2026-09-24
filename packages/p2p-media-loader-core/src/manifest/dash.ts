// Ambient typings for untyped packages must travel with the modules that
// import them, so other packages compiling these sources see them too.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendor-types.d.ts" />
import {
  inheritAttributes,
  stringToMpdXml,
  toM3u8,
  toPlaylists,
  type MpdPlaylist,
} from "mpd-parser";
import { ensureObjectValues } from "./shims/object-values.js";
import type {
  ManifestParser,
  ParsedSegment,
  ParsedStream,
  SegmentIndexSource,
  ParsedInitSegment,
} from "./types.js";
import { audioStreamProperties, videoStreamProperties } from "./properties.js";
import { byteRangeFromOffsetLength, distinctInitSegments } from "./url-key.js";
import { parseSidx } from "./mp4-sidx.js";
import type { StreamProperties, StreamType } from "../types.js";

// Supplies a builtin mpd-parser assumes; must run before the first parse.
ensureObjectValues();

/**
 * DASH tokenizer over mpd-parser. Produces `ParsedManifest`; interprets
 * nothing. An MPD declares streams and segments in one document, so every
 * stream here may carry segments — or, for `SegmentBase`, an external index.
 *
 * Only video and audio are streams. mpd-parser sorts AdaptationSets by
 * `mimeType` and `contentType`, and only its video playlists and audio
 * groups are read: text — WebVTT, TTML, IMSC in MP4 — and image thumbnails
 * never register. A trick-mode video set is the DASH form of an I-frame
 * playlist and is left out for the same reason; mpd-parser does not report
 * it, so `readMpd` does. See specs/manifest-registry.md, "Segments core does
 * not register".
 */
export const dashManifestParser: ManifestParser = {
  protocol: "dash",

  canParse(text) {
    return /<MPD[\s>]/.test(text.slice(0, 2048));
  },

  parseSegmentIndex: parseSidx,

  parse(text, url) {
    // mpd-parser's own pipeline, step by step, so its DOM parse runs once and
    // the document it produces also answers what its summary does not report:
    // whether the presentation is live, the channel count of each audio
    // Representation, and which Representations are trick play.
    const mpd = stringToMpdXml(text);
    const inherited = inheritAttributes(mpd, { manifestUri: url });
    const manifest = toM3u8({
      dashPlaylists: toPlaylists(inherited.representationInfo),
      locations: inherited.locations,
      contentSteering: inherited.contentSteeringInfo,
      eventStream: inherited.eventStream,
    });
    const { isLive, channelsByRepresentation, trickModeRepresentations } =
      readMpd(mpd);
    const isTrickMode = (playlist: MpdPlaylist) =>
      playlist.attributes.NAME !== undefined &&
      trickModeRepresentations.has(playlist.attributes.NAME);

    const streams: ParsedStream[] = [];
    for (const playlist of manifest.playlists) {
      if (isTrickMode(playlist)) continue;
      streams.push(toStream(playlist, "main", isLive, videoProperties));
    }
    const groups = manifest.mediaGroups.AUDIO ?? {};
    for (const groupId of Object.keys(groups)) {
      const renditions = groups[groupId];
      for (const label of Object.keys(renditions)) {
        const rendition = renditions[label];
        for (const playlist of rendition.playlists) {
          if (isTrickMode(playlist)) continue;
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
        // Where the period this index lays out from begins. The parser
        // carries it on the index only when the MPD gives a duration to work
        // from — a live `SegmentBase` stream gives none — while the playlist
        // carries it always. Getting it wrong shifts every segment of the
        // period on the presentation timeline, and a DASH segment's external
        // ID is that timeline: see specs/segment-identity.md.
        periodStart: sidx.timeline ?? playlist.timeline,
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
  // off the index reference instead. A representation spanning periods lists
  // one per period.
  const refs = playlist.segments.length
    ? playlist.segments.map((s) => s.map)
    : [sidx?.map];
  const initSegments: ParsedInitSegment[] = [];
  for (const map of refs) {
    if (!map) continue;
    initSegments.push({
      url: map.resolvedUri,
      byteRange: byteRangeFromOffsetLength(map.byterange),
    });
  }

  return {
    // The representation id is the only stable per-stream name an MPD offers.
    key: playlist.attributes.NAME ?? playlist.resolvedUri,
    type,
    properties: properties(playlist.attributes),
    // A `SegmentBase` representation lists none, and says nothing about the
    // ones its index holds: an empty list would be read as "these are all the
    // segments there are" and take away what the index gave, on every refresh
    // of a live presentation and on any re-parse of a static one.
    segments:
      segments.length === 0 && indexSource.kind === "external"
        ? undefined
        : segments,
    initSegments: distinctInitSegments(initSegments),
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
 *
 * Trick-mode Representations are those carrying the DASH-IF trick-mode
 * descriptor (`http://dashif.org/guidelines/trickmode`) as an
 * `EssentialProperty` or a `SupplementalProperty`, on the Representation or
 * on its AdaptationSet — a descriptor may sit at either level. The descriptor
 * names the set it plays alongside; what carries it is never played at
 * normal speed.
 *
 * Read off the `MPD` element mpd-parser's DOM step hands back — the element,
 * not the document around it — for what the tokenizer's summary leaves out.
 */
function readMpd(mpd: Element): {
  isLive: boolean;
  channelsByRepresentation: Map<string, number>;
  trickModeRepresentations: Set<string>;
} {
  const result = new Map<string, number>();
  const trickModeRepresentations = new Set<string>();

  // `type="dynamic"` is authoritative for live. Read off the element itself,
  // so neither the length of its opening tag nor a change in how the
  // tokenizer summarises the document can hide it.
  const isLive = mpd.getAttribute("type") === "dynamic";

  // Array.from: DOM collections are not iterable under the ES2015 lib target.
  for (const set of Array.from(mpd.getElementsByTagName("AdaptationSet"))) {
    const setChannels = channelCountOf(set);
    const setTrickMode = hasTrickModeDescriptor(set);
    for (const representation of Array.from(
      set.getElementsByTagName("Representation"),
    )) {
      const id = representation.getAttribute("id");
      if (!id) continue;
      if (setTrickMode || hasTrickModeDescriptor(representation)) {
        trickModeRepresentations.add(id);
      }
      const channels = channelCountOf(representation) ?? setChannels;
      if (channels !== undefined) result.set(id, channels);
    }
  }
  return {
    isLive,
    channelsByRepresentation: result,
    trickModeRepresentations,
  };
}

const MPEG_CHANNEL_SCHEME = "23003:3:audio_channel_configuration";
const TRICK_MODE_SCHEME = "http://dashif.org/guidelines/trickmode";

function hasTrickModeDescriptor(element: Element): boolean {
  for (const descriptor of childElementsOf(element)) {
    if (
      descriptor.localName !== "EssentialProperty" &&
      descriptor.localName !== "SupplementalProperty"
    ) {
      continue;
    }
    if (descriptor.getAttribute("schemeIdUri") === TRICK_MODE_SCHEME) {
      return true;
    }
  }
  return false;
}

function channelCountOf(element: Element): number | undefined {
  for (const config of childElementsOf(element)) {
    if (config.localName !== "AudioChannelConfiguration") continue;
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

/**
 * The child elements of a node. `instanceof Element` is no help: the DOM here
 * is whatever `mpd-parser` resolved — xmldom under Node — whose classes are
 * not the global ones, so an element is recognised by its node type, as
 * mpd-parser recognises its own.
 */
function childElementsOf(parent: Element): Element[] {
  const ELEMENT_NODE = 1;
  const elements: Element[] = [];
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) elements.push(child as Element);
  }
  return elements;
}
