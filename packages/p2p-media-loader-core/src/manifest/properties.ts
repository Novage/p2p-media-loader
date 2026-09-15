// Ambient typings for untyped packages must travel with the modules that
// import them, so other packages compiling these sources see them too.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./vendor-types.d.ts" />
import { parseCodecs } from "@videojs/vhs-utils/es/codecs.js";
import type { StreamProperties } from "../types.js";

/**
 * Stream properties from manifest attributes. These feed `identityHash`
 * unnormalized, so what is read here is what every peer hashes; the golden
 * vectors in the core tests pin the results.
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

function codecsOfType(
  codecs: string | undefined,
  mediaType: "video" | "audio",
): string | undefined {
  if (!codecs) return undefined;
  const matching = parseCodecs(codecs)
    .filter((c) => c.mediaType === mediaType)
    .map((c) => `${c.type}${c.details}`);
  return matching.length ? matching.join(",") : undefined;
}

/** The video codecs out of a mixed `CODECS` list; audio and text are dropped. */
function videoCodecs(codecs: string | undefined): string | undefined {
  return codecsOfType(codecs, "video");
}

/** The audio codecs out of a mixed `CODECS` list. */
export function audioCodecs(codecs: string | undefined): string | undefined {
  return codecsOfType(codecs, "audio");
}

/**
 * A variant with no bandwidth carries no trustworthy metadata; every other
 * property is blanked so such variants hash identically everywhere.
 */
export function videoStreamProperties(a: VideoAttributes): StreamProperties {
  const bitrate = a.bandwidth ?? 0;
  const isMissingMetadata = bitrate === 0;
  return {
    bitrate,
    codecs: isMissingMetadata ? undefined : videoCodecs(a.codecs),
    width: isMissingMetadata ? undefined : a.width,
    height: isMissingMetadata ? undefined : a.height,
    frameRate: isMissingMetadata ? undefined : a.frameRate,
    videoRange: isMissingMetadata ? undefined : a.videoRange,
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
