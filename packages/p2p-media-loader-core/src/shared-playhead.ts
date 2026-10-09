import { diagnostics } from "./diagnostics.js";
import type { Playback } from "./internal-types.js";

/** One stream's loader, as the shared playhead sees it. */
export type PlayheadParticipant = {
  /**
   * The stream's buffer edge when it may take part now: its timeline is the
   * others', it has no seek pending, core sees its requests, and its state is
   * a report. `undefined` otherwise.
   */
  currentEdge(): number | undefined;
};

/**
 * One playhead for all the streams of a presentation. See
 * specs/playback-contract.md, "One playhead for all streams".
 *
 * Every player reports one buffer ahead, the lagging stream's: the media
 * element's `buffered` is the intersection of its SourceBuffers, ExoPlayer's
 * buffered position the minimum over its loaders. So `bufferEdge -
 * bufferAhead` is the playhead only for the lagging stream, and lands ahead of
 * it, by the lead, for a stream that runs ahead. The playhead is the minimum
 * of the current streams' edges less that buffer; each stream's own buffer is
 * its edge less the playhead.
 */
export class SharedPlayhead {
  private readonly participants = new Set<PlayheadParticipant>();
  /**
   * Streams whose edge still describes the position a seek left: another
   * stream's request showed the seek, and theirs has not come yet. Without a
   * seek count, a request is the only sign of a seek.
   */
  private readonly stale = new Set<PlayheadParticipant>();

  join(participant: PlayheadParticipant) {
    this.participants.add(participant);
  }

  leave(participant: PlayheadParticipant) {
    this.participants.delete(participant);
    this.stale.delete(participant);
  }

  /**
   * A participant's request showed a seek. The first stream to show it marks
   * the others stale; one that was marked is only catching up with the same
   * seek, and marks nobody.
   */
  onSeek(participant: PlayheadParticipant) {
    if (this.stale.delete(participant)) return;
    for (const other of this.participants) {
      if (other !== participant) this.stale.add(other);
    }
  }

  /** A participant requested at its position: its edge counts again. */
  onRequest(participant: PlayheadParticipant) {
    this.stale.delete(participant);
  }

  /**
   * The buffer ahead `participant`'s stream has, from its own view of the
   * playback: the reported buffer, plus how far its edge runs past the
   * lagging stream's. Its own view where it cannot take part.
   */
  bufferAheadFor(participant: PlayheadParticipant, own: Playback): number {
    if (own.source !== "reported") return own.bufferAhead;
    const edge = this.edgeOf(participant);
    let lowest = edge;
    let count = 0;
    if (edge !== undefined) {
      for (const other of this.participants) {
        const otherEdge = this.edgeOf(other);
        if (otherEdge === undefined) continue;
        count++;
        lowest = Math.min(lowest ?? otherEdge, otherEdge);
      }
    }
    if (edge === undefined || lowest === undefined || count < 2) {
      diagnostics?.count("Playhead:own");
      return own.bufferAhead;
    }
    diagnostics?.count("Playhead:shared");
    return own.bufferAhead + (edge - lowest);
  }

  private edgeOf(participant: PlayheadParticipant): number | undefined {
    if (this.stale.has(participant)) return undefined;
    return participant.currentEdge();
  }
}
