import * as dashjs from "dashjs";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";

/**
 * Players that create dash.js themselves — MediaElement's dash renderer — do
 * so from the global `dashjs` and give no hook between `create()` and
 * `initialize()`. This installs a global whose `MediaPlayer().create()` binds
 * the P2P engine to every player it makes, and returns a function restoring
 * whatever was there before. (OpenPlayerJS works the same way but its 2.x
 * releases call dash.js 4 APIs that dash.js 5 removed, so it has no variant.)
 */
export function installP2PDashJsGlobal(engine: DashJsP2PEngine) {
  const previous = window.dashjs;
  const MediaPlayer = Object.assign(
    () => ({
      create: () => {
        const player = dashjs.MediaPlayer().create();
        engine.bindPlayer(player);
        return player;
      },
    }),
    { events: dashjs.MediaPlayer.events, errors: dashjs.MediaPlayer.errors },
  );
  window.dashjs = { ...dashjs, MediaPlayer };
  return () => {
    window.dashjs = previous;
  };
}
