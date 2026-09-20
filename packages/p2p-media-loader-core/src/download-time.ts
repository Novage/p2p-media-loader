/**
 * The time a download of `bytes` would take at `bandwidth` bits per second,
 * in whole milliseconds and never less than one: what an adapter reports to
 * its player as the duration of a segment the core served, so the player's
 * own bandwidth estimate reads the core's hint rather than the wall clock —
 * which says nothing about the network for a segment that came from a peer
 * or from storage. A bandwidth of nothing is reported as one millisecond.
 */
export function downloadTimeMs(bandwidth: number, bytes: number): number {
  if (bandwidth <= 0) return 1;
  return Math.max(1, Math.round((bytes * 8 * 1000) / bandwidth));
}
