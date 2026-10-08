import { diagnostics, type DiagnosticsToken } from "../diagnostics.js";
import { CoreRequestError } from "../types.js";
import { EngineCallbacks, SegmentWithStream } from "../internal-types.js";

export class EngineRequest {
  private _status: "pending" | "succeed" | "failed" | "aborted" = "pending";
  private _shouldBeStartedImmediately = false;

  /** Open until the request settles: one never settled is a player left waiting. */
  private readonly diagnosticsToken: DiagnosticsToken | undefined;

  constructor(
    readonly segment: SegmentWithStream,
    readonly engineCallbacks: EngineCallbacks,
  ) {
    this.diagnosticsToken = diagnostics.open(
      "PlayerRequest",
      String(segment.externalId),
    );
  }

  get status() {
    return this._status;
  }

  get shouldBeStartedImmediately() {
    return this._shouldBeStartedImmediately;
  }

  /**
   * Hands the segment to the player as a copy — the one place bytes leave the
   * core, and therefore the one place the copy belongs.
   *
   * What the core keeps in storage is what it seeds to peers, and players
   * transfer the buffer they are given to a transmuxing worker, which detaches
   * it: `byteLength` becomes 0 and the bytes are gone. HLS.js and Video.js's
   * VHS both do it. A detached buffer in storage is uploaded to peers as an
   * empty segment and served to the player itself as one, so the stream keeps
   * playing while the swarm quietly circulates nothing.
   *
   * Copying here rather than in each adapter means no integration can get it
   * wrong, and nothing else copies: a prefetched segment the player never asks
   * for is never copied at all.
   */
  resolve(data: ArrayBuffer, bandwidth: number) {
    if (this._status !== "pending") return;
    this._status = "succeed";
    diagnostics.close(this.diagnosticsToken, "succeed");
    diagnostics.count("PlayerRequest:succeed");
    this.engineCallbacks.onSuccess({ data: data.slice(0), bandwidth });
  }

  reject() {
    if (this._status !== "pending") return;
    this._status = "failed";
    diagnostics.close(this.diagnosticsToken, "failed");
    diagnostics.count("PlayerRequest:failed");
    this.engineCallbacks.onError(new CoreRequestError("failed"));
  }

  abort() {
    if (this._status !== "pending") return;
    this._status = "aborted";
    diagnostics.close(this.diagnosticsToken, "aborted");
    diagnostics.count("PlayerRequest:aborted");
    this.engineCallbacks.onError(new CoreRequestError("aborted"));
  }

  markAsShouldBeStartedImmediately() {
    this._shouldBeStartedImmediately = true;
  }
}
