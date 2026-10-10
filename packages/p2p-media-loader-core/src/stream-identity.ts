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
 * Computes a stream's identity hash from the properties the core read from
 * the manifest. Every peer parses the same manifest with the same parser, so
 * the input is already identical everywhere and nothing is normalized: the
 * fields are joined as given. `null`, `undefined` and `""` hash alike, and so
 * do a missing `bitrate` and 0.
 *
 * `bitrate` belongs in the input only when the manifest needs it to tell the
 * stream apart from another of the same type — see {@link identityProperties},
 * which the core applies before hashing. A server reproducing a client's hash
 * must make the same choice.
 *
 * Environment-agnostic: usable in Node.js 16+ as well as in the browser.
 */
export function computeStreamIdentityHash(
  properties: StreamProperties,
): string {
  const field = (value: string | number | null | undefined) =>
    value === undefined || value === null ? "" : String(value);
  const str = [
    properties.bitrate ?? 0,
    field(properties.codecs),
    field(properties.width),
    field(properties.height),
    field(properties.language),
    field(properties.channels),
    field(properties.name),
    field(properties.frameRate),
    field(properties.videoRange),
  ].join("-");
  return btoa(sha1(str));
}

/**
 * The properties that feed each stream's identity, given every stream one
 * manifest declares: the stream's own properties with `bitrate` dropped,
 * unless another stream of the same type in the manifest would then be
 * indistinguishable from it — a ladder with two rungs at one resolution.
 *
 * Bandwidth is the one attribute an origin may recompute on every request:
 * some live packagers publish the encoder's current rate, so two viewers who
 * fetched the master seconds apart would read different `BANDWIDTH` for the
 * same rendition and, were it hashed, never meet. It is therefore left out of
 * identity wherever the rest of the properties already tell the streams apart.
 * The decision depends only on the manifest, so every peer makes the same one.
 */
export function identityProperties(
  streams: readonly { type: StreamType; properties: StreamProperties }[],
): StreamProperties[] {
  const withoutBitrate = streams.map((s): StreamProperties => ({
    ...s.properties,
    bitrate: undefined,
  }));
  const occurrences = new Map<string, number>();
  const keys = streams.map((s, i) => {
    const key = `${s.type}|${computeStreamIdentityHash(withoutBitrate[i])}`;
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    return key;
  });
  return streams.map((s, i) =>
    (occurrences.get(keys[i]) ?? 0) > 1 ? s.properties : withoutBitrate[i],
  );
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
