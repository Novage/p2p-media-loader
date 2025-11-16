// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type shakaType from "shaka-player/dist/shaka-player.compiled.d.ts";
import shakaUI from "shaka-player/dist/shaka-player.ui";
export const shaka = shakaUI as unknown as typeof shakaType;
export { shakaUI, shakaType };
