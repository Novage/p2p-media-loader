/**
 * Which peer fetches a segment over HTTP so that the others can take it over
 * P2P. See specs/prefetch.md.
 *
 * Every peer scores itself and each connected neighbour for the segment with
 * the same hash; the peer with the lowest score in its own neighbourhood is
 * the owner and fetches. Two connected peers can never both be owners, a
 * non-owner always has a neighbour with a lower score to take the segment
 * from once that neighbour holds it, and because the segment id is part of
 * the score, ownership rotates from segment to segment. The same scores rank
 * the non-owners as backups, in the order they step in should the owner
 * fail to deliver in time.
 */

/**
 * 32-bit string hash: FNV-1a with a final avalanche, so that inputs differing
 * in a few characters — peer ids share a prefix, segment ids are sequential —
 * still spread evenly. Dependency-free and the same on every peer.
 */
export function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function scoreForSegment(peerId: string, externalId: number): number {
  return hash32(`${peerId}|${externalId}`);
}

/**
 * How many of `peerIds` outscore `ownPeerId` for the segment, i.e. this
 * peer's place in the line of fetchers: 0 is the owner, 1 the first backup,
 * and so on. Ties, which a 32-bit hash makes vanishingly rare, go to the
 * lexically smaller peer id so that both sides still agree.
 */
export function rankForSegment(
  ownPeerId: string,
  peerIds: Iterable<string>,
  externalId: number,
): number {
  const ownScore = scoreForSegment(ownPeerId, externalId);
  let rank = 0;
  for (const peerId of peerIds) {
    const score = scoreForSegment(peerId, externalId);
    if (score < ownScore || (score === ownScore && peerId < ownPeerId)) {
      rank++;
    }
  }
  return rank;
}

/**
 * Time a backup allows for the owner's announcement to arrive before it
 * counts the owner as absent. Covers a playlist refresh's worth of skew
 * between peers seeing the segment plus the announcement's own latency.
 */
const ANNOUNCEMENT_ALLOWANCE_SECONDS = 0.5;

/**
 * Wall-clock seconds until a request the player has made becomes urgent: until
 * its buffer, in media seconds, drains to the urgency threshold at the
 * playback rate. That is what the fetch-time estimate is measured in. The
 * rate is the last non-zero one the player reported. See
 * specs/playback-contract.md, "Urgency".
 */
export function secondsToUrgent(
  bufferAhead: number,
  urgentBufferThreshold: number,
  rate: number,
): number {
  const playing = rate || 1;
  return (bufferAhead - urgentBufferThreshold * playing) / playing;
}

/**
 * Whether a peer should fetch a segment over HTTP now.
 *
 * The owner always should. A backup should only for a segment its player has
 * requested, and only when waiting any longer would risk the request becoming
 * urgent first: it steps in once the time left until then falls to a
 * multiple of the fetch time it expects. The multiple shrinks with rank — the
 * first backup at twice the fetch time, the second at one and a half, and so on towards
 * once — so backups act in order, each only when the one before it has not.
 */
export function shouldFetchNow(params: {
  rank: number;
  /** Wall-clock seconds until the request becomes urgent; see `secondsToUrgent`. */
  secondsLeft: number;
  estimatedFetchSeconds: number;
}): boolean {
  const { rank, secondsLeft, estimatedFetchSeconds } = params;
  if (rank === 0) return true;
  const factor = 1 + 1 / rank;
  return (
    secondsLeft <=
    estimatedFetchSeconds * factor + ANNOUNCEMENT_ALLOWANCE_SECONDS
  );
}
