import { sha1 } from "./utils/hash.js";

/**
 * Version of the peer swarm protocol. Included in every stream swarm ID, so peers
 * with incompatible protocols never join the same swarm.
 *
 * Changing how a stream ID or a segment ID is derived in any way requires
 * bumping this version. See specs/segment-identity.md.
 */
export const PEER_PROTOCOL_VERSION = "v3";

/**
 * Builds a stream swarm ID: the pre-hash string that names a stream's P2P
 * swarm. Its hash is the infohash announced to trackers (see
 * {@link computeInfoHash}).
 *
 * The `streamId` tells the stream from the content's other streams. By
 * default the core derives it from the manifest — for HLS the stream's type
 * and its index among the master's streams of that type (`main0`,
 * `secondary1`), for DASH the type and the Representation `@id`
 * (`main-video-720`) — or a `streamIdBuilder` returns it. See
 * specs/segment-identity.md.
 *
 * Environment-agnostic: run it on a server (Node.js 16+) to predict the swarm
 * ID, and with {@link computeInfoHash} the infohash, that a client announces.
 */
export function buildStreamSwarmId(swarmId: string, streamId: string): string {
  return `${PEER_PROTOCOL_VERSION}-${swarmId}-${streamId}`;
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
