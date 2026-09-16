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
 * A variant's properties, each as the manifest states it. A missing
 * `BANDWIDTH` says nothing about the rest: bandwidth is the one attribute an
 * origin recomputes per request, which is why identity drops it, and a
 * resolution or a codec string is read the same by every peer whether it is
 * there or not. See specs/segment-identity.md.
 */
export function videoStreamProperties(a: VideoAttributes): StreamProperties {
  return {
    bitrate: a.bandwidth ?? 0,
    codecs: videoCodecs(a.codecs),
    width: a.width,
    height: a.height,
    frameRate: a.frameRate,
    videoRange: a.videoRange,
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
