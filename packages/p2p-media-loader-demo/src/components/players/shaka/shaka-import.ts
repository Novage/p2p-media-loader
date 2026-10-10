// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type shakaType from "shaka-player/dist/shaka-player.compiled.d.ts";
import shakaUI from "shaka-player/dist/shaka-player.ui";
export const shaka = shakaUI as unknown as typeof shakaType;
export { shakaUI, shakaType };

/**
 * Loads `url`, and leaves out the one rejection that is no failure: a player
 * destroyed while it loads — the demo changing stream or player — interrupts
 * the load. Any other failure is logged.
 */
export async function loadStream(player: shakaType.Player, url: string) {
  try {
    await player.load(url);
  } catch (error) {
    const code = (error as { code?: number } | undefined)?.code;
    if (code === shaka.util.Error.Code.LOAD_INTERRUPTED) return;
    // eslint-disable-next-line no-console
    console.error("Error loading the stream", error);
  }
}
