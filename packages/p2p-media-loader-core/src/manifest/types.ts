import type { ByteRange, StreamProperties, StreamType } from "../types.js";

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
  readonly discontinuity?: boolean;
};

export type ParsedInitSegment = {
  readonly url: string;
  readonly byteRange?: ByteRange;
};

/** A stream (variant or rendition) as declared or described by a manifest. */
export type ParsedStream = {
  /**
   * Stable key for this stream within the registry. HLS: the absolute media
   * playlist URL — the same identifier hls.js uses for a level. DASH: the
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
  readonly initSegment?: ParsedInitSegment;
  readonly indexSource: SegmentIndexSource;
  /** Known only from a manifest that carries segments. */
  readonly isLive?: boolean;
};

export type ParsedManifest = {
  readonly protocol: ManifestProtocol;
  /** The URL the manifest was fetched from, after redirects. */
  readonly url: string;
  readonly streams: readonly ParsedStream[];
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
  /** May throw on malformed input; the core treats that as "no change". */
  parse(text: string, url: string): ParsedManifest;
};
