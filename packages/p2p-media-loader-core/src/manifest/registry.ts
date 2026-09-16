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
import { normalizeUrl, segmentKey } from "./url-key.js";
import { rangeCovers, type SidxBox } from "./mp4-sidx.js";

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
  readonly initSegment?: { url: string; byteRange?: ByteRange };
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

export class ManifestRegistry {
  private readonly streams = new Map<string, MutableStream>();

  getStreams(): readonly RegistryStream[] {
    return Array.from(this.streams.values());
  }

  getStream(key: string): RegistryStream | undefined {
    return this.streams.get(key);
  }

  /**
   * Applies one parsed manifest. Idempotent: re-applying an unchanged
   * manifest changes nothing and reports no updates.
   */
  apply(manifest: ParsedManifest): RegistryUpdate[] {
    const updates: RegistryUpdate[] = [];
    // Bitrate enters a stream's identity only where this manifest needs it to
    // tell same-type streams apart; see specs/segment-identity.md.
    const identity = identityProperties(manifest.streams);

    for (const [i, parsed] of manifest.streams.entries()) {
      const stream = this.upsertStream(parsed, manifest, identity[i]);
      if (!parsed.segments) continue;

      updates.push(
        this.applySegments(stream, parsed.segments, manifest.protocol),
      );
    }

    return updates;
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
    parsed: ParsedStream,
    manifest: ParsedManifest,
    identityInput: StreamProperties,
  ): MutableStream {
    const key = this.resolveStreamKey(parsed, manifest);
    const existing = this.streams.get(key);

    // A media playlist says nothing about the stream's identity; only the
    // master does. The first manifest that does decides it, and nothing
    // changes it afterwards: a stream's identity is its swarm, and a live
    // packager republishing its master — a changed BANDWIDTH is enough —
    // would otherwise move a playing stream to a swarm with no peers in it.
    const carriesIdentity =
      !existing || (!parsed.segments && !existing.identified);

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
      initSegment: parsed.initSegment ?? existing?.initSegment,
      isLive: parsed.isLive ?? existing?.isLive,
      segments: existing?.segments ?? new Map<string, RegistrySegment>(),
      timeline: existing?.timeline ?? new Map<number, number>(),
    };
    this.streams.set(key, stream);
    return stream;
  }

  /**
   * An HLS media playlist is matched to the stream its master declared by
   * URL, tolerating a differing query string (signed tokens rotate). No match
   * means a media playlist loaded directly, which is a single anonymous stream.
   */
  private resolveStreamKey(
    parsed: ParsedStream,
    manifest: ParsedManifest,
  ): string {
    if (this.streams.has(parsed.key)) return parsed.key;
    if (manifest.protocol !== "hls" || !parsed.segments) return parsed.key;

    const wanted = stripQuery(normalizeUrl(parsed.key));
    for (const key of this.streams.keys()) {
      if (stripQuery(normalizeUrl(key)) === wanted) return key;
    }
    return parsed.key;
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
    if (segments.every((s) => s.programDateTime !== undefined)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return segments.map((s) => s.programDateTime! / 1000);
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

function stripQuery(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
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
