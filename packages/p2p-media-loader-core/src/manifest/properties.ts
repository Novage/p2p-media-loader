import type { StreamProperties } from "../types.js";

/**
 * Stream properties from manifest attributes, unnormalized. They do not enter
 * the default stream ID; a `streamIdBuilder` receives them, so what is read
 * here is what every peer's builder reads.
 */

export type VideoAttributes = {
  bandwidth?: number;
  codecs?: string;
  width?: number;
  height?: number;
  frameRate?: number | string;
  videoRange?: string;
};

export type AudioAttributes = {
  codecs?: string;
  language?: string;
  channels?: string | number;
  name?: string;
};

/**
 * A variant's properties, each as the manifest states it. A missing
 * `BANDWIDTH` says nothing about the rest: a resolution or a codec string is
 * read the same by every peer whether it is there or not. See
 * specs/segment-identity.md.
 */
export function videoStreamProperties(a: VideoAttributes): StreamProperties {
  return {
    bitrate: a.bandwidth ?? 0,
    codecs: a.codecs,
    width: a.width,
    height: a.height,
    frameRate: a.frameRate,
    videoRange: a.videoRange,
  };
}

/**
 * An alternate video rendition — a camera angle with a playlist of its own.
 * RFC 8216 gives it the characteristics of the variant that references its
 * group, so the variant's attributes are its properties, and the rendition's
 * own `NAME` and `LANGUAGE` are what tell it from the variant.
 */
export function videoRenditionProperties(
  a: VideoAttributes,
  rendition: { name: string; language?: string },
): StreamProperties {
  return {
    ...videoStreamProperties(a),
    language: rendition.language,
    name: rendition.name,
  };
}

/** An alternate audio rendition; bitrate is 0 by convention across players. */
export function audioStreamProperties(a: AudioAttributes): StreamProperties {
  return {
    bitrate: 0,
    codecs: a.codecs,
    language: a.language,
    channels: a.channels,
    name: a.name,
  };
}
