import type { ByteRange, StreamProperties, StreamType } from "../types.js";
import type { SidxBox } from "./mp4-sidx.js";

/** Streaming protocols the core can parse manifests for. */
export type ManifestProtocol = "hls" | "dash";

/**
 * Where a stream's segment list comes from. Most of the time the manifest is
 * the index. DASH `SegmentBase` is the exception: the MPD points at a `sidx`
 * box inside the media file, and the list does not exist until that is read.
 * See specs/manifest-registry.md.
 */
export type SegmentIndexSource =
  | { readonly kind: "manifest" }
  | {
      readonly kind: "external";
      readonly url: string;
      readonly byteRange: ByteRange;
      /** Where the stream's presentation timeline starts; the index's durations lay out from here. */
      readonly periodStart: number;
    };

/** A media segment as the tokenizer saw it, before the core interprets it. */
export type ParsedSegment = {
  /** Absolute URL the player will request. */
  readonly url: string;
  readonly byteRange?: ByteRange;
  readonly duration: number;
  /**
   * HLS: media sequence number of this segment. DASH: zero-based index in the
   * current parse (not `$Number$`), which is why DASH identity uses
   * `presentationTime` instead.
   */
  readonly sequence: number;
  /** HLS `EXT-X-PROGRAM-DATE-TIME`, extrapolated by the tokenizer, in ms. */
  readonly programDateTime?: number;
  /** DASH presentation time in seconds; stable across refreshes. */
  readonly presentationTime?: number;
};

/** Where a segment is: its URL, and its byte range where it is part of a file. */
export type SegmentLocation = {
  readonly url: string;
  readonly byteRange?: ByteRange;
};

export type ParsedInitSegment = {
  readonly url: string;
  readonly byteRange?: ByteRange;
};

/** A stream (variant or rendition) as declared or described by a manifest. */
export type ParsedStream = {
  /**
   * Stable key for this stream within the registry. HLS: the absolute media
   * playlist URL — the same identifier HLS.js uses for a level. DASH: the
   * representation id.
   */
  readonly key: string;
  readonly type: StreamType;
  readonly properties: StreamProperties;
  /**
   * Segments, when this manifest carries them. An HLS master declares
   * streams without segments; a media playlist carries segments for one
   * stream; an MPD carries both.
   */
  readonly segments?: readonly ParsedSegment[];
  /**
   * Every initialization segment this manifest lists for the stream. A
   * playlist carries more than one where its media changes mid-stream: an
   * HLS discontinuity with a new `EXT-X-MAP`, or a period boundary in DASH.
   */
  readonly initSegments?: readonly ParsedInitSegment[];
  readonly indexSource: SegmentIndexSource;
  /** Known only from a manifest that carries segments. */
  readonly isLive?: boolean;
  /**
   * The live window the manifest declares, in seconds, where the span of the
   * listed segments is not a stable measure of it: a DASH
   * `SegmentTemplate@duration` lists every segment that has ended since
   * `timeShiftBufferDepth` ago, and whether the first of them started inside
   * that window or a segment before it depends on the moment of the parse.
   * The span then changes by a segment from one parse to the next, and a
   * placement sized from it with it. Absent where the span is the window.
   */
  readonly declaredWindow?: number;
};

export type ParsedManifest = {
  readonly protocol: ManifestProtocol;
  /** The URL the manifest was fetched from, after redirects. */
  readonly url: string;
  /**
   * The URL that was asked for, where it differs from the one the response
   * came from. A master names the URL of each media playlist, so that is the
   * one a stream is known by; the response URL only says where this viewer's
   * copy came from, and a CDN may answer every request from somewhere else.
   */
  readonly requestedUrl?: string;
  readonly streams: readonly ParsedStream[];
  /**
   * Playlists this manifest names that are not video or audio streams — an
   * HLS master's subtitle renditions and I-frame playlists — as absolute
   * URLs. Their media playlists reach the core like any other, and the
   * registry ignores one that arrives at these rather than registering it as
   * a stream of its own. An MPD names nothing that arrives later.
   */
  readonly excludedPlaylists?: readonly string[];
  /**
   * The segments and initialization segments an MPD lists outside any
   * stream: those of its text AdaptationSets and trick-mode Representations.
   * A player fetches them, so the core recognises them and passes them
   * through rather than counting each a registry miss. A location without
   * a byte range stands for the whole file, any range of it: a WebVTT file
   * given as a `BaseURL`, or a `SegmentBase` file, whose index the core does
   * not read. Present on every MPD, empty where it lists none, since each
   * MPD replaces the last. An HLS playlist that is no stream arrives on its
   * own and carries its segments as a stream the registry ignores.
   */
  readonly nonStreamSegments?: readonly SegmentLocation[];
  /**
   * Present when the manifest's segment list follows from the wall clock
   * rather than from the manifest alone: a dynamic MPD whose segments a
   * `SegmentTemplate@duration` numbers, or whose `SegmentTimeline` repeats an
   * entry until the present (`S@r` < 0). Such a list is only as right as the
   * clock it was computed with, and it grows between refreshes. See
   * specs/manifest-registry.md, "Segments computed from the clock".
   */
  readonly clock?: ManifestClock;
};

/**
 * A time source a manifest names to synchronize with: a DASH `UTCTiming`
 * element of a scheme a browser can use.
 */
export type UtcTimingSource =
  | {
      /**
       * `get`: the response body is the time (`http-xsdate`, `http-iso`).
       * `head`: the response's `Date` header is (`http-head`).
       */
      readonly method: "get" | "head";
      /** Absolute URL of the time server. */
      readonly url: string;
    }
  | {
      /** The manifest carries the time itself (`direct`). */
      readonly method: "direct";
      /** Epoch milliseconds. */
      readonly time: number;
    };

/** How a manifest's segment list depends on the wall clock. */
export type ManifestClock = {
  /** The time sources the manifest names, in the order it names them. */
  readonly utcTiming: readonly UtcTimingSource[];
  /**
   * When a parse of the same manifest next gives a different segment list —
   * a segment becomes available, or one leaves the window — in epoch
   * milliseconds on the clock the parse was given. Absent when nothing more
   * changes.
   */
  readonly nextChangeAt?: number;
};

/** What the core tells a parser beyond the manifest's bytes. */
export type ManifestParseContext = {
  /**
   * The present, in epoch milliseconds, on the clock the manifest's time
   * sources keep. A parser whose segment list depends on the clock computes
   * it for this moment; the local clock is used where no context is given.
   */
  readonly now: number;
};

/**
 * A tokenizer: bytes in, `ParsedManifest` out. Interpretation — identity,
 * timeline, live detection — is the core's and is never part of a parser, so
 * two integrations can never derive identity differently. See
 * specs/packaging.md.
 *
 * Parsers are plain objects, not class instances: the core's config handling
 * copies own properties only.
 */
export type ManifestParser = {
  readonly protocol: ManifestProtocol;
  /** Cheap sniff of the payload; used when the caller does not state the protocol. */
  canParse(text: string): boolean;
  /**
   * May throw on malformed input; the core treats that as "no change". The
   * core parses a manifest that reports a `clock` again as time passes, with
   * the same text and a later `context.now`.
   */
  parse(
    text: string,
    url: string,
    context?: ManifestParseContext,
  ): ParsedManifest;
  /**
   * Reads the segment index a manifest pointed at instead of listing, where
   * the protocol has one: a DASH `SegmentBase` stream's `sidx` box. Bytes in,
   * structure out, like `parse` — where the subsegments it describes sit on
   * the timeline is the core's to say. Absent on a protocol that lists its
   * segments in the manifest, which is what keeps the box reader out of
   * bundles built for that protocol alone. See specs/packaging.md.
   */
  parseSegmentIndex?(data: ArrayBuffer | ArrayBufferView): SidxBox | undefined;
};
