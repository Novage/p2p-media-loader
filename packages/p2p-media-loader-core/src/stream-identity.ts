import type { StreamProperties, StreamType } from "./types.js";
import { sha1 } from "./utils/hash.js";

/**
 * Version of the peer swarm protocol. Included in every stream swarm ID, so peers
 * with incompatible protocols never join the same swarm.
 *
 * Changing the identity derivation in any way requires bumping this version.
 */
export const PEER_PROTOCOL_VERSION = "v3";

/**
 * Computes a stable, unique identity hash for a stream based on its properties.
 * The result is identical for all peers regardless of the player in use or the
 * stream's position in the manifest.
 *
 * Uses a SHA-1 hash of the normalized properties, encoded to standard Base64.
 *
 * This function is environment-agnostic and can be used on a server (Node.js 16+)
 * to reproduce the identity hash a client computes for the same stream.
 */
export function computeStreamIdentityHash({
  bitrate,
  codecs,
  width,
  height,
  language,
  channels,
  name,
  frameRate,
  videoRange,
}: StreamProperties): string {
  const normalizedCodecs = codecs
    ? codecs
        .split(",")
        .map((c: string) => {
          c = c.trim().toLowerCase();
          // Normalize decimal RFC 4281 avc1 codecs to hex (e.g., avc1.66.30 -> avc1.42001e)
          const parts = c.split(".");
          if (
            parts.length === 3 &&
            (parts[0] === "avc1" || parts[0] === "avc")
          ) {
            const profile = parseInt(parts[1], 10);
            const level = parseInt(parts[2], 10);
            if (
              !isNaN(profile) &&
              !isNaN(level) &&
              parts[1] === profile.toString() &&
              parts[2] === level.toString()
            ) {
              const profileHex = `00${profile.toString(16)}`.slice(-2);
              const levelHex = `00${level.toString(16)}`.slice(-2);
              c = `${parts[0]}.${profileHex}00${levelHex}`;
            }
          }
          return c;
        })
        .sort()
        .join(",")
    : "";
  const normalizedLanguage =
    language && language !== "und" ? language.slice(0, 2).toLowerCase() : "";
  const normalizedChannels = channels ? channels.toString().split("/")[0] : "";
  const normalizedName = name ? name.toLowerCase().trim() : "";

  // Normalize frame rates to eliminate trailing zeros (e.g. "30.000" -> "30")
  const normalizedFrameRate =
    frameRate && !isNaN(Number(frameRate)) ? Number(frameRate).toString() : "";

  const normalizedVideoRange = videoRange
    ? videoRange.toUpperCase().trim()
    : "";

  const str = `${bitrate ?? 0}-${normalizedCodecs}-${width ?? ""}-${height ?? ""}-${normalizedLanguage}-${normalizedChannels}-${normalizedName}-${normalizedFrameRate}-${normalizedVideoRange}`;

  return btoa(sha1(str));
}

/**
 * Builds the default stream swarm ID from its components. The stream swarm ID is the
 * pre-hash string that defines which P2P swarm a stream belongs to;
 * its hash is the infohash announced to trackers (see {@link computeInfoHash}).
 */
export function buildStreamSwarmId(
  swarmId: string,
  streamType: StreamType,
  identityHash: string,
): string {
  return `${PEER_PROTOCOL_VERSION}-${swarmId}-${streamType}-${identityHash}`;
}

/**
 * Computes the default stream swarm ID for a stream from its raw properties.
 *
 * This is the derivation a client with no `streamSwarmIdBuilder` configured uses.
 * Run it on a server (Node.js 16+) to predict a stream's swarm ID — and, via
 * {@link computeInfoHash}, the exact infohash the client announces to trackers.
 */
export function computeStreamSwarmId(options: {
  swarmId: string;
  streamType: StreamType;
  properties: StreamProperties;
}): string {
  return buildStreamSwarmId(
    options.swarmId,
    options.streamType,
    computeStreamIdentityHash(options.properties),
  );
}

/**
 * Computes the infohash announced to trackers for the given stream swarm ID.
 *
 * A BitTorrent tracker `infoHash` MUST be exactly 20 bytes.
 * We take 15 bytes of the binary SHA-1 and encode it to Base64.
 * This produces exactly a 20-character ASCII string (no padding).
 * Note: this is a 20-byte ASCII representation, not a standard
 * 20-byte binary SHA-1 infoHash.
 *
 * This function is environment-agnostic: use it on a server (Node.js 16+) to
 * compute the infohashes to allowlist on a private tracker.
 */
export function computeInfoHash(streamSwarmId: string): string {
  return btoa(sha1(streamSwarmId).slice(0, 15));
}
