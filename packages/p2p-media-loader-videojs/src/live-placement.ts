import {
  debug,
  liveDelayFor,
  playerBufferFor,
  type LiveDelay,
  type ProcessedManifest,
} from "p2p-media-loader-core";
import type { VhsPlaylistControllerLike, VideoJsPlayerLike } from "./types.js";
import { diagnostics } from "./diagnostics.js";

/**
 * Places a Video.js player in a live window the way the other adapters place
 * theirs: a live delay deep in the window, and a forward buffer a segment
 * short of it, so the player asks for each segment after its peers have had
 * time to fetch it. See specs/player-adapters.md, "Video.js".
 *
 * VHS has no setting for either. It plays a live stream behind the edge by
 * `suggestedPresentationDelay`, read off the manifest it parsed — then
 * `HOLD-BACK`, then three target durations — and buffers ahead by the
 * page-wide `GOAL_BUFFER_LENGTH`, 30 s, read through its playlist controller's
 * `goalBufferLength()`. Left alone it starts a few segments behind the edge and
 * asks for every new segment as soon as it is listed: every peer fetches it at
 * the same moment, and nobody has it to share.
 *
 * Both are reached on the player's own VHS objects, which are VHS's
 * internals: the delay is written to the manifest VHS parsed, which keeps it
 * across refreshes, and the buffer is a ceiling over this player's
 * `goalBufferLength()`. Where those internals are missing this does nothing,
 * and the ledger says so: the player plays as VHS would, over HTTP at the
 * edge, rather than failing.
 */
export class VhsLivePlacement {
  private readonly logger = debug("p2pml-videojs:placement");
  private target?: LiveDelay;
  /** The playlist controller this placement is on, and what it changed there. */
  private placed?: {
    readonly controller: VhsPlaylistControllerLike;
    readonly loader: NonNullable<
      VhsPlaylistControllerLike["mainPlaylistLoader_"]
    >;
    /** The `goalBufferLength` the controller had, own or inherited. */
    readonly goalBufferLength: () => number;
    readonly hadOwnGoalBufferLength: boolean;
    readonly cappedGoalBufferLength: () => number;
    /** The manifest's own delay, and the one written over it. */
    heldDelay?: number;
    appliedDelay?: number;
    listenerToken?: string;
    overrideToken?: string;
  };
  /** The controller found without the internals, counted once. */
  private unavailable?: object;

  constructor(private readonly player: VideoJsPlayerLike) {}

  /** Takes in what the core made of a manifest of this player's source. */
  update = (manifest: ProcessedManifest) => {
    const target = liveDelayFor(manifest);
    if (!target) {
      // A presentation with nothing live in it is not this placement's.
      if (!manifest.streams.some((stream) => stream.isLive)) {
        this.release("not-live");
      }
      return;
    }
    this.target = target;
    if (!this.attach()) return;
    this.writeDelay();
  };

  /** Gives back everything it changed on the player's VHS objects. */
  release(cause: string) {
    this.target = undefined;
    this.detach(cause);
  }

  /** Gives back what it changed on the controller it is on, and leaves it. */
  private detach(cause: string) {
    const { placed } = this;
    this.placed = undefined;
    if (!placed) return;
    const { controller, loader } = placed;
    loader.off("loadedplaylist", this.writeDelay);
    diagnostics?.close(placed.listenerToken, cause);
    // Only while they are still what this placement left there: a value
    // written from outside since is somebody's later word.
    if (controller.goalBufferLength === placed.cappedGoalBufferLength) {
      if (placed.hadOwnGoalBufferLength) {
        controller.goalBufferLength = placed.goalBufferLength;
      } else {
        delete controller.goalBufferLength;
      }
    }
    diagnostics?.close(placed.overrideToken, cause);
    const { main } = loader;
    if (main && main.suggestedPresentationDelay === placed.appliedDelay) {
      main.suggestedPresentationDelay = placed.heldDelay;
    }
  }

  /**
   * Puts this placement on the player's current playlist controller: VHS
   * builds one for each source. Returns whether it is on one.
   */
  private attach(): boolean {
    const controller = this.player.tech(true)?.vhs?.playlistController_;
    if (this.placed?.controller === controller) return true;
    this.detach("replaced");
    const loader = controller?.mainPlaylistLoader_;
    const goalBufferLength = controller?.goalBufferLength;
    if (
      !controller ||
      !loader ||
      typeof loader.on !== "function" ||
      typeof loader.off !== "function" ||
      typeof goalBufferLength !== "function"
    ) {
      if (controller && this.unavailable !== controller) {
        this.unavailable = controller;
        diagnostics?.count("VhsPlacement:unavailable");
        this.logger("this VHS offers no way to place a live player");
      }
      return false;
    }
    const capped = () => {
      const own = goalBufferLength.call(controller);
      const { target } = this;
      return target ? Math.min(own, playerBufferFor(target)) : own;
    };
    this.placed = {
      controller,
      loader,
      goalBufferLength,
      hadOwnGoalBufferLength: Object.prototype.hasOwnProperty.call(
        controller,
        "goalBufferLength",
      ),
      cappedGoalBufferLength: capped,
    };
    controller.goalBufferLength = capped;
    this.placed.overrideToken = diagnostics?.open("VhsGoalBufferCeiling");
    // Each parse of the manifest: VHS keeps the delay across a refresh, but
    // the first parse is the one the start position is chosen from.
    loader.on("loadedplaylist", this.writeDelay);
    this.placed.listenerToken = diagnostics?.open("VhsPlacementListener");
    return true;
  }

  /**
   * Writes the delay to the manifest VHS parsed, where VHS reads it for the
   * start position and the end of the seekable range. A delay the manifest
   * suggests itself is set aside, as the other adapters set it aside: a
   * server's suggestion places the player near the edge, where there is
   * nothing to share. Written again when the window moves by half a segment.
   */
  private writeDelay = () => {
    const { placed, target } = this;
    const main = placed?.loader.main;
    if (!placed || !target || !main) return;
    const current = main.suggestedPresentationDelay;
    if (
      placed.appliedDelay !== undefined &&
      current === placed.appliedDelay &&
      Math.abs(current - target.delay) < target.segment / 2
    ) {
      return;
    }
    if (current !== placed.appliedDelay) placed.heldDelay = current;
    main.suggestedPresentationDelay = target.delay;
    placed.appliedDelay = target.delay;
    diagnostics?.count("VhsPlacement:applied");
    this.logger(`playing ${target.delay} s behind the live edge`);
  };
}
