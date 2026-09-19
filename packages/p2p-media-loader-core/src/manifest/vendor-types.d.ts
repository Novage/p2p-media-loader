/**
 * Minimal typings for the manifest tokenizers, which ship none. Only the
 * fields the core reads are declared; everything else is deliberately absent
 * so that a new dependency on parser output has to be added here, visibly.
 */

declare module "m3u8-parser" {
  /**
   * `offset` is absent where the manifest wrote none: an `EXT-X-MAP` whose
   * BYTERANGE is a bare length. The parser fills it in for media segments
   * only, from the end of the previous one.
   */
  export type M3u8ByteRange = { length: number; offset?: number };

  export type M3u8Segment = {
    uri: string;
    duration: number;
    byterange?: M3u8ByteRange;
    /** Milliseconds since the epoch; present or extrapolated when any PDT tag exists. */
    programDateTime?: number;
    timeline: number;
    map?: { uri: string; byterange?: M3u8ByteRange };
  };

  export type M3u8PlaylistAttributes = {
    BANDWIDTH?: number;
    CODECS?: string;
    RESOLUTION?: { width: number; height: number };
    "FRAME-RATE"?: number;
    "VIDEO-RANGE"?: string;
    AUDIO?: string;
    NAME?: string;
  };

  export type M3u8Playlist = {
    uri: string;
    attributes: M3u8PlaylistAttributes;
    timeline: number;
  };

  export type M3u8MediaGroupItem = {
    default: boolean;
    language?: string;
    uri?: string;
  };

  export type M3u8Manifest = {
    playlists?: M3u8Playlist[];
    mediaGroups?: {
      AUDIO?: Record<string, Record<string, M3u8MediaGroupItem>>;
    };
    segments?: M3u8Segment[];
    mediaSequence?: number;
    endList?: boolean;
    playlistType?: "VOD" | "EVENT";
  };

  export class Parser {
    manifest: M3u8Manifest;
    push(chunk: string): void;
    end(): void;
  }
}

declare module "mpd-parser" {
  export type MpdByteRange = { length: number; offset?: number };

  export type MpdSegment = {
    uri: string;
    resolvedUri: string;
    duration: number;
    /** Zero-based index into the current parse; NOT the DASH $Number$. */
    number: number;
    /** Seconds on the presentation timeline; stable across refreshes. */
    presentationTime: number;
    byterange?: MpdByteRange;
    map?: { uri: string; resolvedUri: string; byterange?: MpdByteRange };
    timeline: number;
  };

  export type MpdPlaylistAttributes = {
    NAME?: string;
    BANDWIDTH?: number;
    CODECS?: string;
    RESOLUTION?: { width: number; height: number };
    "FRAME-RATE"?: number;
    AUDIO?: string;
  };

  export type MpdSidx = {
    uri: string;
    resolvedUri: string;
    byterange: MpdByteRange;
    duration?: number;
    /** The period start the index's segments lay out from. */
    timeline?: number;
    map?: { uri: string; resolvedUri: string; byterange?: MpdByteRange };
  };

  export type MpdPlaylist = {
    attributes: MpdPlaylistAttributes;
    uri: string;
    resolvedUri: string;
    segments: MpdSegment[];
    sidx?: MpdSidx;
    endList?: boolean;
    mediaSequence?: number;
    timeline: number;
  };

  export type MpdMediaGroupItem = {
    language?: string;
    default: boolean;
    playlists: MpdPlaylist[];
  };

  export type MpdManifest = {
    playlists: MpdPlaylist[];
    mediaGroups: {
      AUDIO?: Record<string, Record<string, MpdMediaGroupItem>>;
    };
    endList?: boolean;
    duration?: number;
    uri?: string;
  };

  export function parse(
    manifestString: string,
    options: { manifestUri: string },
  ): MpdManifest;

  export function addSidxSegmentsToPlaylist(
    playlist: MpdPlaylist,
    sidx: unknown,
    baseUrl: string,
  ): MpdPlaylist;

  /**
   * The DOM step of `parse`, exported by mpd-parser for custom pipelines.
   * Throws on malformed XML.
   */
  /** The `MPD` element itself, not the document around it. */
  export function stringToMpdXml(manifestString: string): Element;
}

declare module "@videojs/vhs-utils/es/codecs.js" {
  export type ParsedCodec = {
    type: string;
    details: string;
    mediaType: "video" | "audio" | "text" | "unknown";
  };
  export function parseCodecs(codecString?: string): ParsedCodec[];
}
