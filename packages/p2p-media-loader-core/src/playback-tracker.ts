import type { PlaybackState } from "./playback.js";

/**
 * The player's last report, and the two values the core takes from it: the
 * buffer ahead of the playhead now, and the rate to size by. See
 * specs/playback-contract.md.
 *
 * Nothing here is estimated. The buffer is the reported one, less what the
 * player has consumed since the report at the rate it reported; that is all.
 */
export class PlaybackTracker {
  private reported?: { state: PlaybackState; at: number };
  private sizingRate = 1;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /**
   * Takes a report from the integration.
   *
   * @param at - When the report was made, if before now: a loader created
   * after it starts from the report it missed.
   * @returns Whether the rate to size by changed.
   */
  report(state: PlaybackState, at = this.now()): boolean {
    this.reported = { state, at };
    if (state.rate > 0 && state.rate !== this.sizingRate) {
      this.sizingRate = state.rate;
      return true;
    }
    return false;
  }

  /**
   * Seconds buffered ahead of the playhead now: the reported buffer less what
   * the player has consumed since the report, never below 0. A paused report
   * does not age, since a paused player consumes nothing. Before any report,
   * 0: a player that has not reported has nothing buffered, as far as the
   * core can tell. See specs/playback-contract.md, "The age of a report".
   */
  bufferAhead(): number {
    const { reported } = this;
    if (!reported) return 0;
    const { bufferAhead, rate } = reported.state;
    const elapsed = (this.now() - reported.at) / 1000;
    return Math.max(0, bufferAhead - elapsed * Math.max(0, rate));
  }

  /**
   * The rate the windows and the urgency threshold are sized by: the last
   * non-zero rate reported, or 1. A paused player keeps it, so prefetch goes
   * on while paused and a request made while paused is judged as if playing.
   */
  rate(): number {
    return this.sizingRate;
  }
}
