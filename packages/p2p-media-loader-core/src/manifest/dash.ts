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
  type MpdRepresentationInfo,
} from "mpd-parser";
import { ensureObjectValues } from "./shims/object-values.js";
import type {
  ManifestClock,
  ManifestParser,
  ParsedSegment,
  ParsedStream,
  SegmentIndexSource,
  ParsedInitSegment,
  UtcTimingSource,
} from "./types.js";
import { audioStreamProperties, videoStreamProperties } from "./properties.js";
import {
  byteRangeFromOffsetLength,
  distinctInitSegments,
  resolveUrl,
} from "./url-key.js";
import { parseSidx } from "./mp4-sidx.js";
import { parseUtcTime } from "./utc-time.js";
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

  parse(text, url, context) {
    // mpd-parser's own pipeline, step by step, so its DOM parse runs once and
    // the document it produces also answers what its summary does not report:
    // whether the presentation is live, the channel count of each audio
    // Representation, and which Representations are trick play.
    const mpd = stringToMpdXml(text);
    // The present on the clock the MPD's time sources keep, where the core
    // knows it: a numbered template's segments are computed for that moment.
    const now = context?.now ?? Date.now();
    const inherited = inheritAttributes(mpd, { manifestUri: url, NOW: now });
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

    if (!isLive) return { protocol: "dash", url, streams, clock: undefined };
    const available = availableSegments(
      withDeclaredWindows(
        streams,
        declaredWindows(inherited.representationInfo, now),
      ),
      openTimelineStart(inherited.representationInfo),
      now,
    );
    const clock = clockOf(
      inherited.representationInfo,
      mpd,
      url,
      now,
      available.nextAvailableAt,
    );
    return { protocol: "dash", url, streams: available.streams, clock };
  },
};

/**
 * The live window each Representation numbered by a `SegmentTemplate@duration`
 * declares, by Representation id: `timeShiftBufferDepth`, or the time since
 * its period began where that is shorter — a channel that started less than a
 * window ago — in seconds. With no `timeShiftBufferDepth` the window is the
 * whole period so far, as mpd-parser lists it. Where a Representation spans
 * periods, the latest period's start is the one the window runs from.
 */
function declaredWindows(
  representations: readonly MpdRepresentationInfo[],
  now: number,
): Map<string, number> {
  const windows = new Map<string, number>();
  for (const { attributes, segmentInfo } of representations) {
    const { id, availabilityStartTime, periodStart = 0 } = attributes;
    if (
      id === undefined ||
      availabilityStartTime === undefined ||
      !segmentInfo.template?.duration ||
      segmentInfo.segmentTimeline
    ) {
      continue;
    }
    const sincePeriodStart = now / 1000 - (availabilityStartTime + periodStart);
    const window = Math.min(
      attributes.timeShiftBufferDepth ?? Infinity,
      sincePeriodStart,
    );
    if (!(window > 0)) continue;
    const latest = windows.get(id);
    windows.set(id, latest === undefined ? window : Math.min(latest, window));
  }
  return windows;
}

/** The streams, each with the window its Representation declares, if any. */
function withDeclaredWindows(
  streams: ParsedStream[],
  windows: ReadonlyMap<string, number>,
): ParsedStream[] {
  if (!windows.size) return streams;
  return streams.map((stream) => {
    const declaredWindow = windows.get(stream.key);
    return declaredWindow === undefined
      ? stream
      : { ...stream, declaredWindow };
  });
}

/**
 * The open `S` entry that ends a Representation's `SegmentTimeline`, where
 * mpd-parser repeats it from the clock — its own conditions, `> 0` included:
 * a negative `@r`, a `$Number$` template and a `minimumUpdatePeriod`.
 */
function openTimelineEntry({
  attributes,
  segmentInfo: { template, segmentTimeline },
}: MpdRepresentationInfo) {
  // A SegmentTimeline element may hold no S at all.
  const open = segmentTimeline?.length
    ? segmentTimeline[segmentTimeline.length - 1]
    : undefined;
  const numbered = (template?.media?.indexOf("$Number$") ?? -1) > 0;
  const refreshed = (attributes.minimumUpdatePeriod ?? 0) > 0;
  if (!open || (open.r ?? 0) >= 0 || !numbered || !refreshed) return;
  return open;
}

/**
 * The MPD's availability start, in epoch seconds, where any Representation's
 * timeline ends in an open entry; `undefined` where none does. The
 * availability start is the MPD's own attribute, so every Representation
 * inherits the same one.
 */
function openTimelineStart(
  representations: readonly MpdRepresentationInfo[],
): number | undefined {
  if (!representations.some((info) => openTimelineEntry(info))) return;
  return representations.find(
    (info) => info.attributes.availabilityStartTime !== undefined,
  )?.attributes.availabilityStartTime;
}

/**
 * The streams with only the segments available at `now`, and when the first
 * segment left out becomes available — applied where the MPD has an open
 * timeline. mpd-parser repeats an open entry up to
 * `NOW + minimumUpdatePeriod`, to cover the MPD until its next refresh, so it
 * lists segments the origin does not have yet, and an elected peer fetches a
 * listed segment at once, into a 404.
 *
 * Every stream of such an MPD is trimmed: the availability start is the MPD's
 * own attribute, so one value serves them all. A duration template has
 * nothing to trim, since mpd-parser lists only segments that have ended, and
 * an explicit timeline in the same MPD loses only segments that have not
 * ended on the synchronized clock, which are not available yet — such an MPD
 * reports a `clock`, so the core synchronizes. An MPD with no open timeline
 * is not trimmed, because nothing in it lists ahead of the present: a
 * duration template lists only segments that have ended, and an explicit
 * timeline lists what the origin published.
 *
 * A segment is available once it has ended: the availability start plus its
 * presentation time, which holds the period start and the
 * `presentationTimeOffset`, plus its duration.
 */
function availableSegments(
  streams: ParsedStream[],
  start: number | undefined,
  now: number,
): { streams: ParsedStream[]; nextAvailableAt?: number } {
  if (start === undefined) return { streams };
  let nextAvailableAt = Infinity;
  const trimmed = streams.map((stream) => {
    if (!stream.segments) return stream;
    const segments = stream.segments.filter((segment) => {
      const availableAt =
        (start + (segment.presentationTime ?? 0) + segment.duration) * 1000;
      if (availableAt <= now) return true;
      nextAvailableAt = Math.min(nextAvailableAt, availableAt);
      return false;
    });
    return segments.length === stream.segments.length
      ? stream
      : { ...stream, segments };
  });
  return Number.isFinite(nextAvailableAt)
    ? { streams: trimmed, nextAvailableAt }
    : { streams: trimmed };
}

/**
 * How the segment list of a live MPD depends on the clock, or `undefined`
 * where it does not. mpd-parser computes two kinds of list from the present
 * rather than reading them off the MPD: a `SegmentTemplate@duration`, whose
 * window runs from `timeShiftBufferDepth` ago to the last segment that has
 * ended, and a `SegmentTimeline` that ends in an open `S@r` < 0, which
 * repeats up to the present — the latter only where the template numbers
 * segments and the MPD is refreshed (`$Number$`, `minimumUpdatePeriod`), as
 * mpd-parser computes it from the clock only then. Both change as time
 * passes with no new MPD, and both are only as right as the clock: see
 * specs/manifest-registry.md, "Segments computed from the clock".
 *
 * @param openTimelineChangeAt - When the next segment of an open timeline
 * becomes available, where the list left one out.
 */
function clockOf(
  representations: readonly MpdRepresentationInfo[],
  mpd: Element,
  url: string,
  now: number,
  openTimelineChangeAt: number | undefined,
): ManifestClock | undefined {
  let dependsOnClock = false;
  let nextChangeAt = Infinity;
  for (const info of representations) {
    const { attributes, segmentInfo } = info;
    const { template, segmentTimeline } = segmentInfo;
    if (segmentTimeline) {
      const open = openTimelineEntry(info);
      if (!open) continue;
      dependsOnClock = true;
      // The open entry gains a repeat each time one of its durations passes.
      const seconds = (open.d ?? 0) / (template?.timescale ?? 1);
      const next =
        openTimelineChangeAt ?? (seconds > 0 ? now + seconds * 1000 : Infinity);
      nextChangeAt = Math.min(nextChangeAt, next);
      continue;
    }
    if (!template?.duration) continue;
    dependsOnClock = true;
    const change = nextNumberedChange(
      attributes,
      template.duration / (template.timescale ?? 1),
      template.endNumber,
      now,
    );
    if (change !== undefined) nextChangeAt = Math.min(nextChangeAt, change);
  }
  if (!dependsOnClock) return undefined;

  return {
    utcTiming: readUtcTiming(mpd, url),
    nextChangeAt: Number.isFinite(nextChangeAt) ? nextChangeAt : undefined,
  };
}

/**
 * When a numbered template's list next changes, by mpd-parser's own
 * arithmetic (`segmentRange.dynamic`): a segment joins when the time since the
 * period began crosses a multiple of the segment duration, and one leaves when
 * that time less `timeShiftBufferDepth` does. An `endNumber` stops the list
 * growing. `segment` is the segment duration in seconds. `undefined` without
 * an availability start, which a live MPD must have.
 */
function nextNumberedChange(
  attributes: MpdRepresentationInfo["attributes"],
  segment: number,
  endNumber: string | undefined,
  now: number,
): number | undefined {
  const { availabilityStartTime, periodStart = 0 } = attributes;
  if (availabilityStartTime === undefined) return;
  const periodStartSeconds = availabilityStartTime + periodStart;
  const elapsed = now / 1000 - periodStartSeconds;
  const nextBoundary = (time: number) =>
    (Math.floor(time / segment) + 1) * segment;

  const changes: number[] = [];
  if (Number.isNaN(Number.parseInt(endNumber ?? "", 10))) {
    changes.push(nextBoundary(elapsed));
  }
  const depth = attributes.timeShiftBufferDepth;
  if (depth !== undefined && Number.isFinite(depth)) {
    changes.push(nextBoundary(elapsed - depth) + depth);
  }
  if (!changes.length) return;
  return (periodStartSeconds + Math.min(...changes)) * 1000;
}

/**
 * The `UTCTiming` schemes a browser can use, by `schemeIdUri`. The NTP ones
 * need a socket a page does not have, and are left out.
 */
const UTC_TIMING_SCHEME =
  /^urn:mpeg:dash:utc:(http-head|http-xsdate|http-iso|direct):(2012|2014)$/;

/**
 * Every `UTCTiming` element of the MPD a browser can use, in document order,
 * which is the MPD's order of preference. An HTTP scheme's value may list
 * several servers, separated by white space; each is a source of its own.
 * mpd-parser's `parseUTCTiming` is not used: it reads only the first element,
 * throws on the NTP schemes, and parses the document again.
 */
function readUtcTiming(mpd: Element, url: string): UtcTimingSource[] {
  const sources: UtcTimingSource[] = [];
  for (const element of childElementsOf(mpd)) {
    if (element.localName !== "UTCTiming") continue;
    const scheme = UTC_TIMING_SCHEME.exec(
      element.getAttribute("schemeIdUri") ?? "",
    )?.[1];
    const value = element.getAttribute("value")?.trim();
    if (!scheme || !value) continue;
    if (scheme === "direct") {
      const time = parseUtcTime(value);
      if (!Number.isNaN(time)) sources.push({ method: "direct", time });
      continue;
    }
    const method = scheme === "http-head" ? "head" : "get";
    for (const server of value.split(/\s+/)) {
      sources.push({ method, url: resolveUrl(server, url) });
    }
  }
  return sources;
}

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
  // A SegmentTemplate hands every segment of a period the same map object, so
  // the Set leaves one per period; a SegmentList builds one per segment, which
  // the key-level dedup below still collapses.
  const refs = new Set(
    playlist.segments.length
      ? playlist.segments.map((s) => s.map)
      : [sidx?.map],
  );
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
