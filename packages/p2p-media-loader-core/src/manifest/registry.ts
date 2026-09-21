import type { ByteRange, StreamProperties, StreamType } from "../types.js";
import type {
  ParsedManifest,
  ParsedSegment,
  ParsedStream,
  SegmentIndexSource,
} from "./types.js";
import {
  computeStreamIdentityHash,
  identityProperties,
} from "../stream-identity.js";
import {
  normalizeUrl,
  rangeCovers,
  segmentKey,
  stripQuery,
} from "./url-key.js";
import type { SidxBox } from "./mp4-sidx.js";

/**
 * The manifest-derived registry: every stream and segment the core knows,
 * as read from the manifests the player fetched. See
 * specs/manifest-registry.md.
 *
 * Everything here is interpretation, and interpretation belongs to the core:
 * canonical identity, the stable timeline, live detection.
 */

type RegistrySegment = {
  readonly key: string;
  readonly url: string;
  readonly byteRange?: ByteRange;
  /** Canonical identity: HLS media sequence; DASH presentation time in 100 ms units. */
  readonly externalId: number;
  readonly startTime: number;
  readonly endTime: number;
};

export type RegistryStream = {
  readonly key: string;
  readonly type: StreamType;
  readonly properties: StreamProperties;
  readonly identityHash: string;
  /**
   * Whether a manifest ever told this stream apart from another. False for a
   * media playlist that reached the registry without the master that names
   * it: its identity is the empty one every such stream computes, so it can
   * only be shared where it is the only stream of its type. See
   * specs/segment-identity.md.
   */
  readonly identified: boolean;
  readonly indexSource: SegmentIndexSource;
  /**
   * Every initialization segment the stream's manifest lists. More than one
   * where its media changes mid-stream — an HLS discontinuity with a new
   * `EXT-X-MAP`, a DASH period boundary — and replaced wholesale by each
   * parse, so one that has rolled out of the window is not kept.
   */
  readonly initSegments: readonly { url: string; byteRange?: ByteRange }[];
  readonly isLive?: boolean;
  readonly segments: ReadonlyMap<string, RegistrySegment>;
};

type MutableStream = Omit<RegistryStream, "segments"> & {
  segments: Map<string, RegistrySegment>;
  /** HLS without PDT: start time of every sequence number laid out so far. */
  timeline: Map<number, number>;
};

/** One per stream the manifest listed segments for, changed or not. */
export type RegistryUpdate = {
  readonly streamKey: string;
  readonly type: StreamType;
  readonly isLive: boolean;
  /** Bounds of the listed segments on the stream's manifest timeline. */
  readonly start: number;
  readonly end: number;
  readonly segmentCount: number;
  readonly added: number;
  readonly removed: number;
};

/** What one manifest did to the registry. */
export type RegistryApplyResult = {
  readonly updates: RegistryUpdate[];
  /**
   * Media playlists this manifest carried that registered nothing, by key:
   * a master named each as carrying no video or audio.
   */
  readonly ignored: string[];
};

export class ManifestRegistry {
  private readonly streams = new Map<string, MutableStream>();
  /**
   * Playlists a master named as carrying no video or audio — subtitle
   * renditions, I-frame playlists — by URL with the query stripped. A media
   * playlist arriving at one is not a stream; see `resolveStreamKey`.
   */
  private readonly excludedPlaylists = new Set<string>();

  getStreams(): readonly RegistryStream[] {
    return Array.from(this.streams.values());
  }

  hasStreams(): boolean {
    return this.streams.size > 0;
  }

  getStream(key: string): RegistryStream | undefined {
    return this.streams.get(key);
  }

  /** Every stream as it now stands, for a caller that needs the whole picture. */
  describeAll(): RegistryUpdate[] {
    return this.getStreams().map(describe);
  }

  /**
   * Applies one parsed manifest. Idempotent: re-applying an unchanged
   * manifest changes nothing and reports no updates.
   */
  apply(manifest: ParsedManifest): RegistryApplyResult {
    const updates: RegistryUpdate[] = [];
    const ignored: string[] = [];
    // Every master's word is kept: a player that chose a subtitle track keeps
    // refreshing its playlist under the name the master it read gave it,
    // whatever a re-fetched master calls it now. The set grows by one name
    // per excluded playlist per master refresh under rotated paths, which is
    // the growth the registry already accepts for the streams themselves.
    for (const url of manifest.excludedPlaylists ?? []) {
      this.excludedPlaylists.add(stripQuery(url));
    }
    // Bitrate enters a stream's identity only where this manifest needs it to
    // tell same-type streams apart; see specs/segment-identity.md.
    const identity = identityProperties(manifest.streams);

    for (const [i, parsed] of manifest.streams.entries()) {
      const key = this.resolveStreamKey(parsed, manifest);
      if (key === undefined) {
        ignored.push(parsed.key);
        continue;
      }
      const stream = this.upsertStream(key, parsed, identity[i]);
      if (!parsed.segments) {
        // A stream whose segments live in an external index is still reported
        // — how live it is, and what it holds so far — so a caller learns of
        // a presentation it has to place before the index has been read. Its
        // segments are not touched: they are the index's, not this
        // manifest's, and a refresh listing none of them means only that the
        // manifest never lists them.
        if (stream.indexSource.kind === "external") {
          updates.push(describe(stream));
        }
        continue;
      }

      updates.push(
        this.applySegments(stream, parsed.segments, manifest.protocol),
      );
    }

    return { updates, ignored };
  }

  /**
   * Whether this key is the initialization segment of a registered stream.
   *
   * Asked rather than remembered: an initialization segment rotates on a
   * discontinuity, a new period or an ad break, and the registry holds the
   * one a stream currently declares. A core that instead kept every key it
   * had ever seen would grow for the life of a live session and go on
   * recognising URLs no stream declares any more.
   */
  isInitSegment(key: string): boolean {
    for (const stream of this.streams.values()) {
      for (const initSegment of stream.initSegments) {
        if (segmentKey(initSegment.url, initSegment.byteRange) === key) {
          return true;
        }
      }
    }
    return false;
  }

  /** Streams whose external index a request for this URL and range would fetch. */
  streamsAwaitingIndex(
    url: string,
    byteRange: ByteRange | undefined,
  ): RegistryStream[] {
    const wanted = normalizeUrl(url);
    const result: RegistryStream[] = [];
    for (const stream of this.streams.values()) {
      const source = stream.indexSource;
      if (source.kind !== "external") continue;
      if (normalizeUrl(source.url) !== wanted) continue;
      if (!rangeCovers(byteRange, source.byteRange)) continue;
      result.push(stream);
    }
    return result;
  }

  /**
   * Lays a stream's segments out from its `sidx` box the way ISO BMFF defines
   * it, which is the layout the player requests: the first subsegment starts
   * `firstOffset` bytes after the end of the `sidx` box itself — not after the
   * declared index range, which may hold further boxes — and the rest follow
   * each other. Presentation time accumulates from the period start in the
   * box's timescale. References to further index boxes are not followed.
   */
  resolveExternalIndex(
    url: string,
    byteRange: ByteRange | undefined,
    sidx: SidxBox,
  ): RegistryUpdate[] {
    const updates: RegistryUpdate[] = [];
    for (const stream of this.streamsAwaitingIndex(url, byteRange)) {
      const source = stream.indexSource;
      if (source.kind !== "external") continue;

      const segments: ParsedSegment[] = [];
      // The box was found at `boxOffset` within a response that began at the
      // requested range's start, so this is its position in the file.
      const boxEnd = (byteRange?.start ?? 0) + sidx.boxOffset + sidx.boxSize;
      let start = boxEnd + sidx.firstOffset;
      // From the start of the period, by accumulated duration. Neither the
      // box's earliest presentation time nor the MPD's presentation time
      // offset is applied; that is an identity decision, recorded in
      // specs/segment-identity.md, and changing it is a protocol bump.
      let presentationTime = source.periodStart;
      for (const reference of sidx.references) {
        if (reference.referenceType === 1) continue;
        const duration = reference.subsegmentDuration / sidx.timescale;
        segments.push({
          url: source.url,
          byteRange: { start, end: start + reference.referencedSize - 1 },
          duration,
          sequence: segments.length,
          presentationTime,
        });
        start += reference.referencedSize;
        presentationTime += duration;
      }

      const mutable = this.streams.get(stream.key);
      if (!mutable) continue;
      updates.push(this.applySegments(mutable, segments, "dash"));
    }
    return updates;
  }

  private upsertStream(
    key: string,
    parsed: ParsedStream,
    identityInput: StreamProperties,
  ): MutableStream {
    const existing = this.streams.get(key);

    // The first manifest to register a stream decides its identity and its
    // type, and nothing changes them afterwards: a stream's identity is its
    // swarm, and a live packager republishing its master — a changed
    // BANDWIDTH is enough — would otherwise move a playing stream to a swarm
    // with no peers in it. A media playlist processed before its master
    // registers an anonymous stream, and the master arriving later does not
    // identify it: no player produces that order (the master is the first
    // manifest a player fetches, and the adapters are in the path from the
    // start), and it is not supported. See specs/manifest-registry.md.
    const carriesIdentity = !existing;

    const stream: MutableStream = {
      key,
      type: existing?.type ?? parsed.type,
      properties: carriesIdentity ? parsed.properties : existing.properties,
      identityHash: carriesIdentity
        ? computeStreamIdentityHash(identityInput)
        : existing.identityHash,
      identified: carriesIdentity
        ? identifies(identityInput)
        : existing.identified,
      indexSource: parsed.indexSource,
      initSegments: parsed.initSegments?.length
        ? parsed.initSegments
        : (existing?.initSegments ?? []),
      isLive: parsed.isLive ?? existing?.isLive,
      segments: existing?.segments ?? new Map<string, RegistrySegment>(),
      timeline: existing?.timeline ?? new Map<number, number>(),
    };
    this.streams.set(key, stream);
    return stream;
  }

  /**
   * An HLS media playlist is matched to the stream its master declared by
   * URL, tolerating a differing query string (signed tokens rotate) and a
   * redirect (the master named what was asked for, not where the response
   * came from). No match means a media playlist loaded directly, which is a
   * single anonymous stream.
   *
   * A match by URL with the query stripped is taken only where one declared
   * stream matches: a master that tells its variants apart by query string
   * alone leaves every one of them matching, and attaching the playlist to
   * whichever came first would register one rendition's segments under
   * another's identity — peers would then serve the wrong bytes by sequence
   * number. The playlist is an anonymous stream instead, shared only if it is
   * alone of its type. An anonymous stream already registered at the same
   * stripped URL is that stream on its next load, whatever token it carries;
   * counted among the matches, it would make every load ambiguous and leave
   * a stream behind on each one.
   *
   * An unmatched playlist is known by what was asked for rather than by where
   * the response came from: a CDN that answers each request from somewhere
   * else would otherwise leave a new stream behind on every refresh.
   *
   * A media playlist a master named as a subtitle rendition or an I-frame
   * playlist is not a stream of this presentation, and resolves to no key:
   * registered anonymously, its WebVTT segments would answer segment lookups.
   * Only a playlist no stream claims by its exact URL — a master naming one
   * URL as both a variant and a subtitle is malformed, and the variant it
   * declared keeps it. Query aside, though, an excluded name is never matched
   * to a declared stream: the playlist could as well be the rendition's, and
   * attaching it would put WebVTT segments under a video stream's identity.
   * That ignores a variant's own refresh under a rotated token too, for the
   * one master that tells its variant from its subtitles by query alone.
   */
  private resolveStreamKey(
    parsed: ParsedStream,
    manifest: ParsedManifest,
  ): string | undefined {
    if (this.streams.has(parsed.key)) return parsed.key;
    if (manifest.protocol !== "hls") return parsed.key;
    if (!parsed.segments) return this.resolveDeclaredKey(parsed, manifest);

    // The playlist is its own stream's key, so the URL asked for is the only
    // other name it can be known by.
    const requested =
      parsed.key === manifest.url ? manifest.requestedUrl : undefined;
    if (requested !== undefined && this.streams.has(requested)) {
      return requested;
    }

    const names = [parsed.key, requested]
      .filter((name): name is string => name !== undefined)
      .map(stripQuery);
    for (const wanted of names) {
      if (this.excludedPlaylists.has(wanted)) continue;
      const declared: string[] = [];
      let anonymous: string | undefined;
      for (const [key, stream] of this.streams) {
        if (stripQuery(key) !== wanted) continue;
        if (stream.identified) declared.push(key);
        else anonymous ??= key;
      }
      if (declared.length === 1) return declared[0];
      if (anonymous !== undefined) return anonymous;
    }
    if (names.some((name) => this.excludedPlaylists.has(name))) {
      return undefined;
    }
    return requested ?? parsed.key;
  }

  /**
   * A stream a master declares under a URL a registered stream already has,
   * query aside, is that stream: a media playlist loaded first under one
   * token and named by the master under another, or a master re-fetched
   * with its playlist tokens rotated. Registered beside it, the master's
   * stream would take the playlist's next refresh and leave the first behind
   * with a stale segment set and no P2P. Only a sole such stream, and only
   * where the master declares one stream at that URL: a master telling its
   * variants apart by query alone cannot say which of them a stream was. An
   * identified stream keeps the identity its first master gave it.
   */
  private resolveDeclaredKey(
    parsed: ParsedStream,
    manifest: ParsedManifest,
  ): string {
    const wanted = stripQuery(parsed.key);
    const declaredHere = manifest.streams.filter(
      (s) => stripQuery(s.key) === wanted,
    );
    if (declaredHere.length !== 1) return parsed.key;

    let match: string | undefined;
    for (const key of this.streams.keys()) {
      if (stripQuery(key) !== wanted) continue;
      if (match !== undefined) return parsed.key;
      match = key;
    }
    return match ?? parsed.key;
  }

  private applySegments(
    stream: MutableStream,
    segments: readonly ParsedSegment[] = [],
    protocol: ParsedManifest["protocol"],
  ): RegistryUpdate {
    const next = new Map<string, RegistrySegment>();
    const times = this.layoutTimeline(stream, segments, protocol);

    segments.forEach((s, i) => {
      const key = segmentKey(s.url, s.byteRange);
      const startTime = times[i];
      next.set(key, {
        key,
        url: s.url,
        byteRange: s.byteRange,
        externalId: externalIdOf(s, protocol),
        startTime,
        endTime: startTime + s.duration,
      });
    });

    let added = 0;
    let removed = 0;
    for (const key of stream.segments.keys()) {
      if (!next.has(key)) {
        stream.segments.delete(key);
        removed++;
      }
    }
    for (const [key, segment] of next) {
      if (!stream.segments.has(key)) added++;
      stream.segments.set(key, segment);
    }

    let start = Infinity;
    let end = -Infinity;
    for (const segment of next.values()) {
      start = Math.min(start, segment.startTime);
      end = Math.max(end, segment.endTime);
    }
    return {
      streamKey: stream.key,
      type: stream.type,
      isLive: stream.isLive === true,
      start: next.size ? start : 0,
      end: next.size ? end : 0,
      segmentCount: next.size,
      added,
      removed,
    };
  }

  /**
   * Start times that mean the same thing across refreshes.
   *
   * - DASH: presentation time, already stable.
   * - HLS with `EXT-X-PROGRAM-DATE-TIME`: the tokenizer extrapolates it to
   *   every segment; wall-clock seconds are the timeline.
   * - HLS without it: anchor on media sequence. Lay out from a sequence
   *   number already placed; if none overlaps, continue from the last known
   *   end, or start at zero. The zero point never leaves the core.
   */
  private layoutTimeline(
    stream: MutableStream,
    segments: readonly ParsedSegment[],
    protocol: ParsedManifest["protocol"],
  ): number[] {
    if (protocol === "dash") {
      return segments.map((s) => s.presentationTime ?? 0);
    }
    const dates = segments.map((s) => s.programDateTime);
    if (dates.every((date): date is number => date !== undefined)) {
      return dates.map((date) => date / 1000);
    }

    const { timeline } = stream;
    const anchorIndex = segments.findIndex((s) => timeline.has(s.sequence));
    const times = new Array<number>(segments.length);

    if (anchorIndex === -1) {
      let start = 0;
      if (timeline.size) {
        const lastSequence = Math.max(...timeline.keys());
        start =
          (timeline.get(lastSequence) ?? 0) +
          (this.durationOf(stream, lastSequence) ?? 0);
      }
      for (let i = 0; i < segments.length; i++) {
        times[i] = start;
        start += segments[i].duration;
      }
    } else {
      times[anchorIndex] = timeline.get(segments[anchorIndex].sequence) ?? 0;
      for (let i = anchorIndex + 1; i < segments.length; i++) {
        times[i] = times[i - 1] + segments[i - 1].duration;
      }
      for (let i = anchorIndex - 1; i >= 0; i--) {
        times[i] = times[i + 1] - segments[i].duration;
      }
    }

    segments.forEach((s, i) => timeline.set(s.sequence, times[i]));
    // Sequence numbers that slid out of the window are never revisited.
    if (timeline.size > segments.length * 4) {
      const keep = new Set(segments.map((s) => s.sequence));
      for (const sequence of timeline.keys()) {
        if (!keep.has(sequence)) timeline.delete(sequence);
      }
    }
    return times;
  }

  private durationOf(
    stream: MutableStream,
    sequence: number,
  ): number | undefined {
    for (const segment of stream.segments.values()) {
      if (segment.externalId === sequence) {
        return segment.endTime - segment.startTime;
      }
    }
    return undefined;
  }
}

function externalIdOf(
  s: ParsedSegment,
  protocol: ParsedManifest["protocol"],
): number {
  // See specs/segment-identity.md: HLS media sequence is canonical; a DASH
  // segment number is not available in every addressing mode, so DASH uses
  // presentation time in 100 ms units — fine enough to separate any real
  // segments, coarse enough to keep peer announcements compact.
  return protocol === "dash"
    ? Math.round((s.presentationTime ?? 0) * 10)
    : s.sequence;
}

/**
 * Whether an identity input says anything at all. Every absent property is
 * present and undefined, so counting keys would make the empty identity — the
 * one a media playlist with no master computes — look like an identity of its
 * own.
 */
function identifies(properties: StreamProperties): boolean {
  return Object.keys(properties).some(
    (key) => properties[key as keyof StreamProperties] !== undefined,
  );
}

/** A stream's current state, for a manifest that listed no segments of it. */
function describe(stream: RegistryStream): RegistryUpdate {
  let start = Infinity;
  let end = -Infinity;
  for (const segment of stream.segments.values()) {
    start = Math.min(start, segment.startTime);
    end = Math.max(end, segment.endTime);
  }
  const segmentCount = stream.segments.size;
  return {
    streamKey: stream.key,
    type: stream.type,
    isLive: stream.isLive === true,
    start: segmentCount ? start : 0,
    end: segmentCount ? end : 0,
    segmentCount,
    added: 0,
    removed: 0,
  };
}
